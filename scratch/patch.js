const fs = require('fs');
const code = fs.readFileSync('backend/index.js', 'utf8');

const startMarker = `app.post('/api/autonomous-agent', authenticateToken, async (req, res) => {`;
const endMarker = `  }
});

app.listen(PORT, () => {`;

const startIndex = code.indexOf(startMarker);
const endIndex = code.indexOf(endMarker);

if (startIndex === -1 || endIndex === -1) {
  console.log("Could not find markers");
  process.exit(1);
}

const before = code.substring(0, startIndex);
const after = code.substring(endIndex);

const newFunction = `app.post('/api/autonomous-agent', authenticateToken, async (req, res) => {
  try {
    const { prompt, context } = req.body;
    let intent = context ? { ...context } : {};

    if (prompt && !context?.clarification_field) {
      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      const systemInstruction = \`You are a movie booking assistant. Extract booking intent from the user message.
Return ONLY valid JSON with these EXACT fields:
- "movie_title": string or null
- "city": string or null
- "quantity": number (default 2)
- "snack": string or null
- "genre": string or null
- "time_of_day": string or null\`;

      if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
        try {
          const { GoogleGenerativeAI } = require('@google/generative-ai');
          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({
            model: 'gemini-1.5-flash',
            systemInstruction,
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
          });
          const result = await model.generateContent(prompt);
          intent = { ...intent, ...JSON.parse(result.response.text()) };
        } catch (e) { console.warn(e.message); }
      }
      
      intent.quantity = Math.min(Math.max(parseInt(intent.quantity) || 2, 1), 10);
    } else if (prompt && context?.clarification_field) {
      intent[context.clarification_field] = prompt;
      delete intent.clarification_field;
    }

    if (!intent.city) {
      return res.json({
        type: 'clarify',
        message: 'Which city are you looking to watch this in?',
        options: ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'],
        context: { ...intent, clarification_field: 'city' }
      });
    }

    let timeStr = null;
    if (intent.time_of_day) {
      const t = intent.time_of_day.toLowerCase();
      const specificTime = t.match(/(\\d+)(?::\\d+)?\\s*(am|pm)/i);
      if (specificTime) {
        let hour = parseInt(specificTime[1]);
        if (specificTime[2].toLowerCase() === 'pm' && hour < 12) hour += 12;
        if (specificTime[2].toLowerCase() === 'am' && hour === 12) hour = 0;
        timeStr = \`\${hour.toString().padStart(2, '0')}:00\`;
      } else if (t === 'morning') timeStr = '10:00';
      else if (t === 'afternoon') timeStr = '14:00';
      else if (t === 'evening' || t === 'tonight') timeStr = '18:00';
      else if (t === 'night') timeStr = '20:00';
    }

    const { query } = require('./db');
    const params = [];
    let sql = \`
      SELECT 
        s.show_id, s.show_time, s.base_price, s.is_surge_active, s.available_seats,
        m.title, m.poster_url, m.genre,
        c.name as cinema_name, c.city,
        sc.name as screen_name, sc.screen_id
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
    \`;

    let paramIdx = 1;
    if (intent.city) {
      sql += \` AND c.city ILIKE $\${paramIdx}\`;
      params.push(\`%\${intent.city}%\`);
      paramIdx++;
    }
    if (intent.movie_title) {
      sql += \` AND m.title ILIKE $\${paramIdx}\`;
      params.push(\`%\${intent.movie_title}%\`);
      paramIdx++;
    }

    sql += \` ORDER BY \`;
    const orderClauses = [];
    if (intent.genre) {
      orderClauses.push(\`(CASE WHEN m.genre ILIKE $\${paramIdx} THEN 0 ELSE 1 END) ASC\`);
      params.push(\`%\${intent.genre}%\`);
      paramIdx++;
    }
    if (timeStr) {
      orderClauses.push(\`ABS(EXTRACT(EPOCH FROM s.show_time::time) - EXTRACT(EPOCH FROM $\${paramIdx}::time)) ASC\`);
      params.push(timeStr);
      paramIdx++;
    }
    orderClauses.push(\`m.vote_average DESC\`, \`s.show_time ASC\`);
    sql += orderClauses.join(', ') + \` LIMIT 5\`;

    const showRes = await query(sql, params);

    if (showRes.rows.length === 0) {
      const hint = intent.movie_title || intent.genre || 'any movie';
      return res.json({ type: 'error', message: \`No shows found for \${hint} in \${intent.city}. Try a different query.\` });
    }

    const uniqueMovies = [...new Set(showRes.rows.map(r => r.title))];
    if (!intent.movie_title && uniqueMovies.length > 1) {
      return res.json({
        type: 'clarify',
        message: 'I found a few movies playing. Which one would you like?',
        options: uniqueMovies.slice(0, 4),
        context: { ...intent, clarification_field: 'movie_title' }
      });
    }

    const bestShow = showRes.rows[0];

    if (bestShow.available_seats < intent.quantity) {
      return res.json({
        type: 'waitlist',
        message: \`"\${bestShow.title}" at \${bestShow.cinema_name} only has \${bestShow.available_seats} seats left, but you asked for \${intent.quantity}. Would you like to join the waitlist?\`,
        waitlistData: { show_id: bestShow.show_id, requested_seats: intent.quantity }
      });
    }

    const seatRes = await query(\`
      SELECT seat_id, row_no, seat_no, seat_type, price_multiplier 
      FROM seats 
      WHERE screen_id = $1 
        AND seat_id NOT IN (
          SELECT t.seat_id FROM tickets t JOIN bookings b ON t.booking_id = b.booking_id
          WHERE b.show_id = $2 AND b.status = 'Confirmed'
        )
      ORDER BY 
        CASE WHEN seat_type = 'VIP' THEN 1 WHEN seat_type = 'Premium' THEN 2 ELSE 3 END ASC,
        row_no ASC, seat_no ASC
      LIMIT $3
    \`, [bestShow.screen_id, bestShow.show_id, intent.quantity]);

    if (seatRes.rows.length < intent.quantity) {
       return res.json({ type: 'error', message: 'Not enough seats available.' });
    }

    const selectedSeats = seatRes.rows;
    const basePrice = parseFloat(bestShow.base_price);
    const surgeMultiplier = bestShow.is_surge_active ? 1.2 : 1.0;
    const totalTicketPrice = selectedSeats.reduce((sum, s) => sum + (basePrice * parseFloat(s.price_multiplier) * surgeMultiplier), 0);

    let preCartSnacks = {};
    if (intent.snack) {
      const snRes = await query(\`SELECT snack_id as id FROM snacks WHERE name ILIKE $1 LIMIT 1\`, [\`%\${intent.snack}%\`]);
      if (snRes.rows.length > 0) preCartSnacks[snRes.rows[0].id] = 1;
    }

    res.json({
      type: 'checkout',
      payload: {
        show_id: bestShow.show_id,
        preSelectedSeatIds: selectedSeats.map(s => s.seat_id),
        selectedSeats, showInfo: bestShow, totalTicketPrice, preCartSnacks
      }
    });
`;

fs.writeFileSync('backend/index.js', before + newFunction + after);
console.log("Patched");
