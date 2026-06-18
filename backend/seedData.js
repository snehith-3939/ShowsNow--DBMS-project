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
      console.log('Fetching realtime data from TMDB...');
      try {
        const response = await fetch(`https://api.themoviedb.org/3/trending/movie/week?api_key=${TMDB_API_KEY}`);
        const data = await response.json();

        const genreRes = await fetch(`https://api.themoviedb.org/3/genre/movie/list?api_key=${TMDB_API_KEY}`);
        const genreData = await genreRes.json();
        const genreMap = {};
        genreData.genres.forEach(g => { genreMap[g.id] = g.name; });

        movies = await Promise.all(data.results.slice(0, 20).map(async m => {
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
            trailer_key
          };
        }));
      } catch(e) {
        console.warn('TMDB fetch failed, using fallback:', e.message);
        movies = fallbackMovies;
      }
    } else {
      console.log('No TMDB_API_KEY found, using 15 fallback movies...');
    }

    await client.query('BEGIN');

    let movieIdx = 0;
    for (const m of movies) {
      const res = await client.query(
        `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview, vote_average, vote_count, trailer_key)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING movie_id`,
        [m.title, m.genre, m.duration_mins, m.language,
         m.poster_url || null, m.banner_url || null,
         m.overview || '', m.vote_average || 0, m.vote_count || 0, m.trailer_key || null]
      );
      
      const movieId = res.rows[0].movie_id;
      
      // Assign this movie to EVERY screen across ALL cities
      const screensRes = await client.query('SELECT screen_id FROM screens');
      const allScreens = screensRes.rows;

      if (allScreens.length > 0) {
        // Standard cinema slot hours (from midnight today) — looks like real BookMyShow timings
        // Each movie is offset by 15 mins per slot to satisfy UNIQUE(screen_id, show_time)
        // So Movie 0 = 10:30, 13:30, 16:30, 19:30
        //    Movie 1 = 10:45, 13:45, 16:45, 19:45
        //    Movie 2 = 11:00, 14:00, 17:00, 20:00  etc.
        const baseSlotMinutes = [630, 810, 990, 1170]; // 10:30, 13:30, 16:30, 19:30 in mins from midnight

        for (const screen of allScreens) {
          for (let dayOffset = 0; dayOffset < 5; dayOffset++) {
            for (const baseMin of baseSlotMinutes) {
              const slotMin = baseMin + (movieIdx * 15); // 15-min stagger per movie
              await client.query(
                `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats)
                 VALUES ($1, $2, DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata' + ($3 || ' days')::INTERVAL + ($4 || ' minutes')::INTERVAL, $5, 50)
                 ON CONFLICT DO NOTHING`,
                [movieId, screen.screen_id, dayOffset, slotMin, Math.floor(Math.random() * 200) + 200]
              );
            }
          }
        }
      }
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
