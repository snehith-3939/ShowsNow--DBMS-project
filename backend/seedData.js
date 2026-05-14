require('dotenv').config();
const { pool } = require('./db');

const TMDB_API_KEY = process.env.TMDB_API_KEY;

// Fallback high-quality data if no API key is provided
const fallbackMovies = [
  {
    title: "Dune: Part Two",
    genre: "Science Fiction",
    duration_mins: 166,
    language: "English",
    poster_url: "https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJlCjQH2JGqqO0w2.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/8rpDcsfLJypbO6vtec0E0x41KkO.jpg"
  },
  {
    title: "Kung Fu Panda 4",
    genre: "Animation",
    duration_mins: 94,
    language: "English",
    poster_url: "https://image.tmdb.org/t/p/w500/kDp1vUBnMpeNU0KcQVb4w11hAOc.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/1XDDXPXGiI8idBf56Zt0sYqZ0zS.jpg"
  },
  {
    title: "Godzilla x Kong: The New Empire",
    genre: "Action",
    duration_mins: 115,
    language: "English",
    poster_url: "https://image.tmdb.org/t/p/w500/tMefBSflR6PGQLvLuPEHZgtU0Z.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/qrGtVFbwWj7Qk28g0Z9lO46Ff2U.jpg"
  },
  {
    title: "Oppenheimer",
    genre: "Drama",
    duration_mins: 181,
    language: "English",
    poster_url: "https://image.tmdb.org/t/p/w500/8Gxv8gHkK6h3W2zK9I2d0Z3w0GZ.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/fm6KqXpk3M2HVveHwCrBRoBaF0V.jpg"
  },
  {
    title: "Deadpool & Wolverine",
    genre: "Action",
    duration_mins: 120,
    language: "English",
    poster_url: "https://image.tmdb.org/t/p/w500/8cdWjvZQUqZQU2eZ8wG0xZt7bF.jpg",
    banner_url: "https://image.tmdb.org/t/p/w1280/9l1eZiJHmhr5jIlthMdJN5Z1G0Z.jpg"
  }
];

async function seedData() {
  const client = await pool.connect();
  try {
    let movies = fallbackMovies;

    if (TMDB_API_KEY) {
      console.log('Fetching realtime data from TMDB...');
      const response = await fetch(`https://api.themoviedb.org/3/trending/movie/day?api_key=${TMDB_API_KEY}`);
      const data = await response.json();

      // For each movie, also fetch its details to get runtime & genre names
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
    } else {
      console.log('No TMDB_API_KEY found, using fallback realistic data...');
    }

    await client.query('BEGIN');

    for (const m of movies) {
      const res = await client.query(
        `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview, vote_average, vote_count, trailer_key) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING movie_id`,
        [m.title, m.genre, m.duration_mins, m.language, m.poster_url, m.banner_url,
         m.overview || '', m.vote_average || 0, m.vote_count || 0, m.trailer_key]
      );
      
      const movieId = res.rows[0].movie_id;
      
      // Assign multiple show times across a random subset of screens
      const screensRes = await client.query('SELECT screen_id FROM screens');
      const allScreens = screensRes.rows;
      if (allScreens.length > 0) {
        const times = ['10:30:00', '14:00:00', '18:00:00', '21:30:00'];
        // Pick 6-8 random screens for this movie
        const shuffled = allScreens.sort(() => 0.5 - Math.random());
        const numScreens = Math.min(Math.floor(Math.random() * 3) + 6, allScreens.length);
        const selectedScreens = shuffled.slice(0, numScreens);
        
        for (const screen of selectedScreens) {
          for (let i = 0; i < times.length; i++) {
            for (let day = 0; day < 4; day++) {
              await client.query(
                `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats) 
                 VALUES ($1, $2, CURRENT_DATE + $3::integer + TIME '${times[i]}', $4, 50)
                 ON CONFLICT DO NOTHING`,
                [movieId, screen.screen_id, day, Math.floor(Math.random() * 200) + 200]
              );
            }
          }
        }
      }
    }

    await client.query('COMMIT');
    console.log('Successfully seeded real movies into the DBMS!');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error seeding data:', error);
  } finally {
    client.release();
    pool.end();
  }
}

seedData();
