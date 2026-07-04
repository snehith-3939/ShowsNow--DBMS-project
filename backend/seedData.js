require('dotenv').config();
const { pool } = require('./db');

const TMDB_API_KEY = process.env.TMDB_API_KEY;

// 15 movies with verified TMDB CDN poster URLs (image.tmdb.org works fine in browsers)
// TMDB image CDN is separate from their API — no API key needed, no ISP blocks
const fallbackMovies = [
  {
    title: "Dune: Part Two",
    genre: "Science Fiction",
    duration_mins: 166,
    language: "English",
    overview: "Follow the mythic journey of Paul Atreides as he unites with Chani and the Fremen while on a path of revenge against the conspirators who destroyed his family.",
    vote_average: 8.5,
    poster_url: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2JGqqO0w2.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/xOMo8BRK7PfcJv9JCnx7s5hj0PX.jpg"
  },
  {
    title: "Kung Fu Panda 4",
    genre: "Animation",
    duration_mins: 94,
    language: "English",
    overview: "Po must train a new Dragon Warrior, while a shape-shifting villain threatens the Valley of Peace.",
    vote_average: 7.2,
    poster_url: "https://image.tmdb.org/t/p/w500/kDp1vUBnMpeNU0KcQVb4w11hAOc.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/1XDDXPXGiI8idBf56Zt0sYqZ0zS.jpg"
  },
  {
    title: "Godzilla x Kong: The New Empire",
    genre: "Action",
    duration_mins: 115,
    language: "English",
    overview: "Two ancient titans, Godzilla and Kong, clash in an epic battle as humans unravel their intertwined origins.",
    vote_average: 6.8,
    poster_url: "https://image.tmdb.org/t/p/w500/z1p34vh7dEOnLDmyCrlUVLuoDzd.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/fY3lD0jM5AoHJMunjGWqJ0hRteI.jpg"
  },
  {
    title: "Oppenheimer",
    genre: "Drama",
    duration_mins: 181,
    language: "English",
    overview: "The story of J. Robert Oppenheimer's role in the development of the atomic bomb during WWII.",
    vote_average: 8.9,
    poster_url: "https://image.tmdb.org/t/p/w500/8Gxv8gHkK6h3W2zK9I2d0Z3w0GZ.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBRoBaF0V.jpg"
  },
  {
    title: "Deadpool & Wolverine",
    genre: "Action",
    duration_mins: 128,
    language: "English",
    overview: "Deadpool is offered a chance to join the MCU, but things take a turn when he teams up with Wolverine.",
    vote_average: 7.8,
    poster_url: "https://image.tmdb.org/t/p/w500/8cdWjvZQUqZQU2eZ8wG0xZt7bF.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/9l1eZiJHmhr5jIlthMdJN5Z1G0Z.jpg"
  },
  {
    title: "Inside Out 2",
    genre: "Animation",
    duration_mins: 100,
    language: "English",
    overview: "Riley enters high school and Joy, Sadness and other Emotions face a new challenge — a brand new, yet unknown Emotion.",
    vote_average: 7.9,
    poster_url: "https://image.tmdb.org/t/p/w500/vpnVM9B6NMmQpWeZvzLvDESb2QY.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/nDh3nG2TDRB2vcUbv6aMTUa5f0E.jpg"
  },
  {
    title: "Gladiator II",
    genre: "Drama",
    duration_mins: 148,
    language: "English",
    overview: "Lucius is captured and forced to fight as a gladiator in the Colosseum after the Romans overtake his home.",
    vote_average: 7.3,
    poster_url: "https://image.tmdb.org/t/p/w500/2cxhvwyEwRlysAmRH4iodkvo0z5.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/euYIwmwkmz95mnXvufEJpKQseYx.jpg"
  },
  {
    title: "Wicked",
    genre: "Musical",
    duration_mins: 160,
    language: "English",
    overview: "The story of the unlikely friendship between Elphaba and Glinda before they became the Wicked Witch and Glinda the Good.",
    vote_average: 7.5,
    poster_url: "https://image.tmdb.org/t/p/w500/xDGbZ0JJ3mYaGKy4Nzd9Kph6M9L.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/uVlUu174iiKLOptrkiGMKaj2dKX.jpg"
  },
  {
    title: "Alien: Romulus",
    genre: "Horror",
    duration_mins: 119,
    language: "English",
    overview: "A group of young space colonizers come face to face with the most terrifying life form in the universe.",
    vote_average: 7.1,
    poster_url: "https://image.tmdb.org/t/p/w500/b33nnKl1GSFbao4l3fZDDqsMx0F.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/9SSEUrSqhljBMzRe4aBTh17LP9Q.jpg"
  },
  {
    title: "The Wild Robot",
    genre: "Animation",
    duration_mins: 102,
    language: "English",
    overview: "A robot named Roz is shipwrecked on an uninhabited island and must learn to survive in the wild.",
    vote_average: 8.3,
    poster_url: "https://image.tmdb.org/t/p/w500/wTnV3PCVW5O92JMrFvvrRcV39RU.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/417X2RM1ypLWA6xOOkw3KuiXAKE.jpg"
  },
  {
    title: "Moana 2",
    genre: "Animation",
    duration_mins: 100,
    language: "English",
    overview: "Moana receives an unexpected call from her wayfinding ancestors and must journey to the far seas of Oceania.",
    vote_average: 7.0,
    poster_url: "https://image.tmdb.org/t/p/w500/aLVkiINlIeCkcZIzb7XHzPYgO6L.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/bqMvFAT2IwCEGqSfPkKyIMxXOlV.jpg"
  },
  {
    title: "Twisters",
    genre: "Action",
    duration_mins: 122,
    language: "English",
    overview: "Kate Cooper is lured back to the plains of Oklahoma to test a new tornado-disrupting technique.",
    vote_average: 7.0,
    poster_url: "https://image.tmdb.org/t/p/w500/pjnD08FlMAIXsfOLKQbIt9ZMo5e.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/mDeUmPe4MF35WWlAqj4QDX5QXCL.jpg"
  },
  {
    title: "Captain America: Brave New World",
    genre: "Action",
    duration_mins: 118,
    language: "English",
    overview: "Sam Wilson, the new Captain America, finds himself in the middle of an international incident.",
    vote_average: 6.1,
    poster_url: "https://image.tmdb.org/t/p/w500/pzIddUEMWhWzfvLI3TwxUG2wGoi.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/2U7LmNvj8bfocBGP5e0AuMvSMvP.jpg"
  },
  {
    title: "Mufasa: The Lion King",
    genre: "Animation",
    duration_mins: 118,
    language: "English",
    overview: "The story of Mufasa the Great King, told to young Kiara, Simba's daughter, by Rafiki.",
    vote_average: 7.0,
    poster_url: "https://image.tmdb.org/t/p/w500/lurEK87kukWNaHd0zYnsi3yzJrs.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/fezEHBkOJlgS9SwvgDNmd20dLoa.jpg"
  },
  {
    title: "Joker: Folie à Deux",
    genre: "Drama",
    duration_mins: 138,
    language: "English",
    overview: "Arthur Fleck is incarcerated at Arkham Asylum and struggles between his own identity and the Joker's persona.",
    vote_average: 5.3,
    poster_url: "https://image.tmdb.org/t/p/w500/fst9BXd7O5qCkn1aRNOHD1sPAjg.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/j9eOeLlTGoIaFXJqCfxPgEFQBds.jpg"
  }
];

async function seedData() {
  const client = await pool.connect();
  try {
    let movies = fallbackMovies;

    if (TMDB_API_KEY) {
      console.log('Fetching realtime data from TMDB (Now Playing + Upcoming)...');
      try {
        const [nowPlayingRes, upcomingRes, genreRes] = await Promise.all([
          fetch(`https://api.themoviedb.org/3/movie/now_playing?api_key=${TMDB_API_KEY}&region=IN`),
          fetch(`https://api.themoviedb.org/3/movie/upcoming?api_key=${TMDB_API_KEY}&region=IN`),
          fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`)
        ]);

        const nowPlayingData = await nowPlayingRes.json();
        const upcomingData = await upcomingRes.json();
        const genreData = await genreRes.json();

        const genreMap = {};
        genreData.genres.forEach(g => { genreMap[g.id] = g.name; });

        // Take top 15 now playing + top 15 upcoming
        const combinedMovies = [
          ...(nowPlayingData.results || []).slice(0, 15),
          ...(upcomingData.results || []).slice(0, 15)
        ];

        // Deduplicate by ID
        const uniqueMovies = [];
        const seenIds = new Set();
        for (const m of combinedMovies) {
          if (!seenIds.has(m.id)) {
            seenIds.add(m.id);
            uniqueMovies.push(m);
          }
        }

        movies = await Promise.all(uniqueMovies.map(async m => {
          let runtime = 120;
          let trailer_key = null;
          try {
            const detRes = await fetch(`https://api.themoviedb.org/3/movie/${m.id}?api_key=${TMDB_API_KEY}&append_to_response=videos`);
            const det = await detRes.json();
            runtime = det.runtime || 120;
            if (det.videos && det.videos.results) {
              const trailer = det.videos.results.find(v => v.type === 'Trailer' && v.site === 'YouTube');
              if (trailer) trailer_key = trailer.key;
            }
          } catch(e) {}
          return {
            title: m.title,
            genre: m.genre_ids.slice(0, 2).map(id => genreMap[id] || 'Various').join(', '),
            duration_mins: runtime,
            language: m.original_language.toUpperCase(),
            poster_url: m.poster_path ? `https://image.tmdb.org/t/p/w500${m.poster_path}` : null,
            banner_url: m.backdrop_path ? `https://image.tmdb.org/t/p/w1280${m.backdrop_path}` : null,
            overview: m.overview || '',
            vote_average: m.vote_average || 0,
            vote_count: m.vote_count || 0,
            trailer_key,
            release_date: m.release_date || new Date().toISOString().split('T')[0]
          };
        }));
      } catch(e) {
        console.warn('TMDB fetch failed, using fallback:', e.message);
        movies = fallbackMovies;
      }
    } else {
      console.log('No TMDB_API_KEY found, using fallback movies...');
    }

    await client.query('BEGIN');

    let movieIdx = 0;
    for (const m of movies) {
      const existing = await client.query('SELECT movie_id FROM movies WHERE title = $1', [m.title]);
      let movieId;
      
      if (existing.rows.length > 0) {
        movieId = existing.rows[0].movie_id;
        await client.query('UPDATE movies SET vote_average = $1, vote_count = $2 WHERE movie_id = $3', [m.vote_average || 0, m.vote_count || 0, movieId]);
      } else {
        const res = await client.query(
          `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview, vote_average, vote_count, trailer_key, release_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING movie_id`,
          [m.title, m.genre, m.duration_mins, m.language,
           m.poster_url || null, m.banner_url || null,
           m.overview || '', m.vote_average || 0, m.vote_count || 0, m.trailer_key || null, m.release_date || null]
        );
        movieId = res.rows[0].movie_id;
      }
      
      // Use a single SQL query to generate all shows instantly for this movie
      await client.query(`
        INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats)
        SELECT 
            m.movie_id, 
            s.screen_id, 
            DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' 
              + (d.dayOffset || ' days')::INTERVAL 
              + ((slots.baseMin + ($2::int * 15)) || ' minutes')::INTERVAL,
            FLOOR(RANDOM() * 200) + 200,
            s.total_seats
        FROM movies m
        CROSS JOIN screens s
        CROSS JOIN generate_series(0, 4) AS d(dayOffset)
        CROSS JOIN (VALUES (630), (810), (990), (1170)) AS slots(baseMin)
        WHERE m.movie_id = $1 
          AND (m.release_date IS NULL OR (DATE_TRUNC('day', NOW()) + (d.dayOffset || ' days')::INTERVAL) >= m.release_date)
          AND MOD(ABS(hashtext(s.screen_id::text)), $3) = $2
        ON CONFLICT DO NOTHING;
      `, [movieId, movieIdx, movies.length]);
      movieIdx++;
    }

    await client.query('COMMIT');
    console.log(`Successfully seeded ${movies.length} movies into the DBMS!`);
    console.log('Shows scheduled for next 5 days across all cities.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', error);
  } finally {
    client.release();
  }
}

seedData().finally(() => pool.end());
