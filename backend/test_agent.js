require('dotenv').config();

const HF_API_KEY = process.env.HF_API_KEY;
console.log('HF_API_KEY loaded:', HF_API_KEY ? `${HF_API_KEY.substring(0, 8)}...` : 'MISSING');

async function testHF() {
  const prompt = 'Book me 2 tickets for Devil Wears Prada 2 in Mumbai with nachos';

  const systemPrompt = `You are a movie booking assistant. Extract booking intent from the user message and return ONLY valid JSON with these fields:
- "movie_title": string or null
- "city": string or null
- "quantity": number (default 2)
- "snack": string or null
- "genre": string or null
- "time_of_day": string or null

Return ONLY the JSON object. No explanation. No markdown.`;

  console.log('\nSending to HuggingFace Mistral-7B...');

  const hfResponse = await fetch(
    'https://api-inference.huggingface.co/models/mistralai/Mistral-7B-Instruct-v0.3',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${HF_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        inputs: `<s>[INST] ${systemPrompt}\n\nUser message: "${prompt}" [/INST]`,
        parameters: { max_new_tokens: 200, temperature: 0.1, return_full_text: false }
      })
    }
  );

  console.log('HF Status:', hfResponse.status);
  const data = await hfResponse.json();
  console.log('Raw HF Response:', JSON.stringify(data, null, 2));

  if (hfResponse.ok) {
    const rawText = Array.isArray(data) ? data[0]?.generated_text : data?.generated_text;
    console.log('\nGenerated text:', rawText);
    const jsonMatch = rawText?.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      console.log('\n✅ Parsed intent:', JSON.parse(jsonMatch[0]));
    } else {
      console.log('❌ Could not extract JSON from response');
    }
  } else {
    console.log('❌ HF API Error:', data);
  }
}

testHF().catch(console.error);
