const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cron = require('node-cron');
const { exec } = require('child_process');
const { query, pool } = require('./db');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || (process.env.NODE_ENV === 'production' ? null : 'fallback_secret_change_me');
const HOLD_MINUTES = 10;
const APP_TIME_ZONE = process.env.APP_TIME_ZONE || 'Asia/Kolkata';
const PAYMENT_METHODS = new Set(['Demo', 'UPI', 'Card', 'NetBanking', 'Wallet', 'Cash']);
const LOYALTY_REWARD_SETTLEMENT_SECONDS = Math.max(
  0,
  parseInt(process.env.LOYALTY_REWARD_SETTLEMENT_SECONDS || '30', 10) || 30
);

if (!JWT_SECRET) {
  throw new Error('JWT_SECRET must be set in production');
}

const configuredOrigins = [
  'https://showsnow-chi.vercel.app',
  process.env.FRONTEND_URL,
  process.env.VERCEL_URL && `https://${process.env.VERCEL_URL}`,
  ...(process.env.CORS_ORIGINS || '').split(','),
].filter(Boolean).map(origin => origin.trim().replace(/\/$/, ''));
const devOrigins = ['http://localhost:5173', 'http://127.0.0.1:5173'];
const allowedOrigins = new Set([...configuredOrigins, ...devOrigins]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin.replace(/\/$/, ''))) {
      return callback(null, true);
    }
    return callback(null, false);
  },
}));
app.use(express.json());

const isUuid = (value) =>
  typeof value === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

async function logAdminAction(db, adminId, action, entityType, entityId, details = {}) {
  await db.query(
    `INSERT INTO admin_audit_logs (admin_id, action, entity_type, entity_id, details)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [adminId, action, entityType, entityId || null, JSON.stringify(details)]
  );
}

const loyaltyBalanceSql = `
  SELECT COALESCE(SUM(
    CASE
      WHEN points_earned > 0
        AND (expires_at IS NULL OR expires_at > NOW())
        AND ($2::timestamp IS NULL OR created_at <= $2::timestamp)
      THEN points_earned
      ELSE 0
    END - points_spent
  ), 0) AS balance
  FROM loyalty_ledger
  WHERE user_id = $1
`;

async function lockUserLoyaltyLedger(db, userId) {
  await db.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`loyalty:${userId}`]);
}

async function getLoyaltyRedeemableAt(db) {
  const result = await db.query(
    "SELECT transaction_timestamp() - ($1::int * INTERVAL '1 second') AS redeemable_at",
    [LOYALTY_REWARD_SETTLEMENT_SECONDS]
  );
  return result.rows[0].redeemable_at;
}

async function getLoyaltyBalance(db, userId, earnedBefore = null) {
  const result = await db.query(loyaltyBalanceSql, [userId, earnedBefore]);
  return parseInt(result.rows[0].balance, 10) || 0;
}

const BOT_OUT_OF_SCOPE_MESSAGE = 'I can only help with booking movie tickets on ShowsNow. Try asking me to find a movie, showtime, seats, or snacks.';
const BOT_CHECKOUT_CONFIRM_LABEL = 'Continue to checkout';
const BOOKING_INTENT_PATTERN = /\b(book|booking|ticket|tickets|tix|movie|movies|show|shows|showtime|showtimes|cinema|cinemas|seat|seats|watch|playing|popcorn|snack|snacks|coke|pepsi|nachos)\b/i;
const ACTOR_FILTER_PATTERN = /\b(actor|actress|actors|actresses|cast|starring|starred|featuring|hero|heroine)\b/i;
const SEAT_CHANGE_PATTERN = /\b(seat|seats|row|front|back|rear|middle|center|centre|vip|premium|regular|normal|cheap|cheapest|together|adjacent)\b/i;
const LANGUAGE_ALIASES = {
  english: ['english', 'en'],
  hindi: ['hindi', 'hi'],
  telugu: ['telugu', 'te'],
  tamil: ['tamil', 'ta'],
  malayalam: ['malayalam', 'ml'],
  kannada: ['kannada', 'kn'],
  korean: ['korean', 'ko'],
  japanese: ['japanese', 'ja'],
  french: ['french', 'fr'],
  spanish: ['spanish', 'es'],
};
const GENRE_ALIASES = ['action', 'comedy', 'drama', 'horror', 'romance', 'thriller', 'sci-fi', 'science fiction', 'animation', 'musical'];
const AI_QUERY_INTENTS = new Set(['movie_search', 'cinema_search', 'show_search', 'booking_checkout', 'snack_search', 'help']);
const CITY_ALIASES = new Map([
  ['bombay', 'Mumbai'],
  ['mumbai', 'Mumbai'],
  ['delhi', 'Delhi'],
  ['new delhi', 'Delhi'],
  ['bangalore', 'Bengaluru'],
  ['bengaluru', 'Bengaluru'],
  ['blr', 'Bengaluru'],
  ['hyderabad', 'Hyderabad'],
  ['hyd', 'Hyderabad'],
  ['chennai', 'Chennai'],
  ['madras', 'Chennai'],
  ['pune', 'Pune'],
  ['kolkata', 'Kolkata'],
  ['calcutta', 'Kolkata'],
  ['ahmedabad', 'Ahmedabad'],
]);

function hasBookingIntent(prompt = '') {
  return BOOKING_INTENT_PATTERN.test(prompt);
}

function normalizeQueryIntent(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return AI_QUERY_INTENTS.has(normalized) ? normalized : null;
}

async function extractLocalBookingIntent(promptText) {
  const lowerPrompt = promptText.toLowerCase();
  const intent = {};
  let extractedSomething = false;

  const numMatch = lowerPrompt.match(/(\d+)\s*(?:ticket|tickets|tix)/i) ||
    lowerPrompt.match(/(?:for\s+)?(\d+)\s*(?:people|person|of us)/i) ||
    lowerPrompt.match(/^(10|[1-9])$/);
  if (numMatch) {
    intent.quantity = parseInt(numMatch[1], 10);
    extractedSomething = true;
  } else if (/\b(one|alone|myself)\b/.test(lowerPrompt) || /\bme\b/.test(lowerPrompt)) {
    intent.quantity = 1;
    extractedSomething = true;
  } else if (lowerPrompt.includes('two')) {
    intent.quantity = 2;
    extractedSomething = true;
  } else if (lowerPrompt.includes('three')) {
    intent.quantity = 3;
    extractedSomething = true;
  } else if (lowerPrompt.includes('four')) {
    intent.quantity = 4;
    extractedSomething = true;
  }

  for (const [alias, city] of [...CITY_ALIASES.entries()].sort((a, b) => b[0].length - a[0].length)) {
    if (lowerPrompt.includes(alias)) {
      intent.city = city;
      extractedSomething = true;
      break;
    }
  }

  const timeMatch = lowerPrompt.match(/(\d{1,2}:\d{2})\s*(am|pm)?/i) || lowerPrompt.match(/(\d{1,2})\s*(am|pm)/i);
  if (timeMatch) {
    intent.time_of_day = timeMatch[0];
    extractedSomething = true;
  } else if (lowerPrompt.includes('tonight')) {
    intent.time_of_day = 'tonight';
    extractedSomething = true;
  } else if (lowerPrompt.includes('morning')) {
    intent.time_of_day = 'morning';
    extractedSomething = true;
  } else if (lowerPrompt.includes('afternoon')) {
    intent.time_of_day = 'afternoon';
    extractedSomething = true;
  } else if (lowerPrompt.includes('evening')) {
    intent.time_of_day = 'evening';
    extractedSomething = true;
  } else if (lowerPrompt.includes('night')) {
    intent.time_of_day = 'night';
    extractedSomething = true;
  }

  if (lowerPrompt.includes('tomorrow')) {
    intent.date = 'tomorrow';
    extractedSomething = true;
  } else if (lowerPrompt.includes('today') || lowerPrompt.includes('tonight')) {
    intent.date = 'today';
    extractedSomething = true;
  }

  if (/\b(more|other|next|anymore|any more|another)\b/i.test(lowerPrompt)) {
    intent.option_offset = true;
    extractedSomething = true;
  }

  const snacks = ['popcorn', 'coke', 'pepsi', 'nachos', 'water', 'coffee', 'fries', 'burger', 'tea'];
  for (const snack of snacks) {
    if (lowerPrompt.includes(snack)) {
      intent.snack = snack;
      extractedSomething = true;
      break;
    }
  }

  const genres = ['action', 'comedy', 'drama', 'horror', 'romance', 'thriller', 'sci-fi', 'science fiction', 'animation'];
  for (const genre of genres) {
    if (lowerPrompt.includes(genre)) {
      intent.genre = genre === 'science fiction' ? 'sci-fi' : genre;
      extractedSomething = true;
      break;
    }
  }

  const languages = ['english', 'hindi', 'telugu', 'tamil', 'malayalam', 'kannada', 'korean', 'japanese', 'french', 'spanish'];
  for (const lang of languages) {
    if (lowerPrompt.includes(lang)) {
      intent.language = lang;
      extractedSomething = true;
      break;
    }
  }

  const cinemaChains = ['pvr', 'inox', 'miraj', 'carnival', 'cinepolis'];
  for (const chain of cinemaChains) {
    if (lowerPrompt.includes(chain)) {
      intent.cinema_name = chain;
      extractedSomething = true;
      break;
    }
  }

  const moviesRes = await query('SELECT title FROM movies ORDER BY title');
  const movieMatches = [];
  const promptWords = new Set(lowerPrompt.split(/[^a-z0-9]+/).filter(word => word.length >= 3));
  for (const movie of moviesRes.rows) {
    const title = movie.title.toLowerCase();
    const titleWords = title.split(/[^a-z0-9]+/).filter(word => word.length >= 3);
    if (lowerPrompt.includes(title)) {
      movieMatches.push(movie.title);
    } else if (titleWords.length > 0 && titleWords.every(word => promptWords.has(word))) {
      movieMatches.push(movie.title);
    } else if (titleWords.length === 1 && promptWords.has(titleWords[0])) {
      movieMatches.push(movie.title);
    }
  }

  const uniqueMovieMatches = [...new Set(movieMatches)];
  if (uniqueMovieMatches.length === 1) {
    intent.movie_title = uniqueMovieMatches[0];
    extractedSomething = true;
  } else if (uniqueMovieMatches.length > 1) {
    intent.movie_options = uniqueMovieMatches.slice(0, 5);
    extractedSomething = true;
  }

  return { intent, extractedSomething };
}

function normalizeOptionKey(value = '') {
  return String(value).trim().toLowerCase();
}

function isPresent(value) {
  return value !== undefined && value !== null && value !== '' && !(Array.isArray(value) && value.length === 0);
}

function mergePresent(base, update = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (isPresent(value)) merged[key] = value;
  }
  return merged;
}

function mergeMissing(base, update = {}) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(update)) {
    if (!isPresent(merged[key]) && isPresent(value)) merged[key] = value;
  }
  return merged;
}

function buildOptionContext(baseIntent, clarificationField, optionValues = {}) {
  const optionMap = {};
  for (const [label, value] of Object.entries(optionValues)) {
    optionMap[label] = value;
    optionMap[normalizeOptionKey(label)] = value;
  }
  return {
    ...baseIntent,
    clarification_field: clarificationField,
    option_map: optionMap,
  };
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function toIsoDate(date) {
  return date.toISOString().split('T')[0];
}

function getNextWeekdayDate(dayName) {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const target = days.indexOf(dayName);
  if (target === -1) return null;
  const today = new Date();
  const diff = (target - today.getDay() + 7) % 7 || 7;
  return toIsoDate(addDays(today, diff));
}

function parseDateIntent(dateValue) {
  if (!dateValue) return null;
  const text = String(dateValue).trim().toLowerCase();
  if (text === 'today' || text === 'tonight') return toIsoDate(new Date());
  if (text === 'tomorrow') return toIsoDate(addDays(new Date(), 1));
  if (text === 'weekend') {
    const today = new Date();
    const saturdayDiff = (6 - today.getDay() + 7) % 7 || 7;
    return toIsoDate(addDays(today, saturdayDiff));
  }
  const weekday = text.match(/\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/);
  if (weekday) return getNextWeekdayDate(weekday[1]);
  const iso = text.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) return iso[1];
  const parsed = new Date(dateValue);
  if (!Number.isNaN(parsed.getTime())) return toIsoDate(parsed);
  return null;
}

function parseTimeIntent(timeValue) {
  if (!timeValue) return null;
  const text = String(timeValue).trim().toLowerCase();
  const dropdownMatch = text.match(/^(today|tomorrow|[a-z]{3}\s\d{1,2}),\s*(\d{1,2}):(\d{2})\s*(am|pm)$/i);
  if (dropdownMatch) {
    let hour = parseInt(dropdownMatch[2], 10);
    const min = dropdownMatch[3];
    const ampm = dropdownMatch[4].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:${min}`;
  }

  const specificTimeWithColon = text.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  const specificTimeWithoutColon = text.match(/\b(\d{1,2})\s*(am|pm)\b/i);
  if (specificTimeWithColon) {
    let hour = parseInt(specificTimeWithColon[1], 10);
    const min = specificTimeWithColon[2];
    const ampm = specificTimeWithColon[3] ? specificTimeWithColon[3].toLowerCase() : null;
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    if (!ampm) return null;
    return `${hour.toString().padStart(2, '0')}:${min}`;
  }
  if (specificTimeWithoutColon) {
    let hour = parseInt(specificTimeWithoutColon[1], 10);
    const ampm = specificTimeWithoutColon[2].toLowerCase();
    if (ampm === 'pm' && hour < 12) hour += 12;
    if (ampm === 'am' && hour === 12) hour = 0;
    return `${hour.toString().padStart(2, '0')}:00`;
  }
  if (text === 'morning') return '10:00';
  if (text === 'afternoon') return '14:00';
  if (text === 'evening' || text === 'tonight') return '18:00';
  if (text === 'night') return '20:00';
  return null;
}

function zonedDateKey(dateValue, timeZone = APP_TIME_ZONE) {
  const date = dateValue instanceof Date ? dateValue : new Date(dateValue);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function formatTimeInAppZone(dateValue) {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: APP_TIME_ZONE,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  }).format(new Date(dateValue)).toLowerCase();
}

function formatDateInAppZone(dateValue) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: APP_TIME_ZONE,
    month: 'short',
    day: 'numeric'
  }).format(new Date(dateValue));
}

function formatShowOptionTime(show) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const showDateKey = zonedDateKey(show.show_time);
  const isToday = showDateKey === zonedDateKey(today);
  const isTomorrow = showDateKey === zonedDateKey(tomorrow);
  const datePrefix = isToday ? 'Today' : isTomorrow ? 'Tomorrow' : formatDateInAppZone(show.show_time);
  return `${datePrefix}, ${formatTimeInAppZone(show.show_time)}`;
}

function selectedOptionFromContext(context, promptText) {
  const optionMap = context?.option_map || {};
  return optionMap[promptText] || optionMap[normalizeOptionKey(promptText)] || null;
}

function sanitizeBotContext(intent = {}) {
  const {
    option_map,
    clarification_field,
    checkoutPayload,
    assistant_message,
    out_of_scope,
    query_intent,
    missing_fields,
    user_wants_checkout,
    reset,
    ...rest
  } = intent;
  return rest;
}

function normalizeCityValue(city) {
  if (typeof city !== 'string') return city;
  const trimmed = city.trim();
  return trimmed.toLowerCase() === 'all' ? null : trimmed;
}

function canonicalLanguageFromText(value = '') {
  const text = String(value).trim().toLowerCase();
  for (const [language, aliases] of Object.entries(LANGUAGE_ALIASES)) {
    if (aliases.includes(text)) return language;
  }
  return null;
}

function languageSearchTerms(value = '') {
  const text = String(value).trim().toLowerCase();
  const canonical = canonicalLanguageFromText(text) || text;
  return [...new Set([canonical, ...(LANGUAGE_ALIASES[canonical] || [text])].filter(Boolean))];
}

function titleLooksGenericMovieRequest(title = '') {
  const text = String(title).trim().toLowerCase();
  return /^(movie|movies|latest movie|latest movies|new movie|new movies|newest movie|newest movies)$/.test(text);
}

function normalizeGenericTitleIntent(intent) {
  const normalized = { ...intent };
  if (!normalized.movie_title || typeof normalized.movie_title !== 'string') return normalized;

  const title = normalized.movie_title.trim().toLowerCase();
  const languageMovieMatch = title.match(/^([a-z]+)\s+movies?$/);
  if (languageMovieMatch) {
    const language = canonicalLanguageFromText(languageMovieMatch[1]);
    if (language) {
      normalized.language = normalized.language || language;
      delete normalized.movie_title;
      return normalized;
    }
  }

  const genreMovieMatch = title.match(/^([a-z -]+)\s+movies?$/);
  if (genreMovieMatch && GENRE_ALIASES.includes(genreMovieMatch[1])) {
    normalized.genre = normalized.genre || (genreMovieMatch[1] === 'science fiction' ? 'sci-fi' : genreMovieMatch[1]);
    delete normalized.movie_title;
    return normalized;
  }

  if (titleLooksGenericMovieRequest(title)) {
    if (/\b(latest|new|newest)\b/.test(title)) normalized.sort_preference = normalized.sort_preference || 'latest_release';
    delete normalized.movie_title;
  }

  return normalized;
}

function normalizeBotIntent(intent = {}) {
  const normalized = normalizeGenericTitleIntent(sanitizeBotContext(intent));
  const normalizedCity = normalizeCityValue(normalized.city);
  if (normalized.city && !normalizedCity) {
    delete normalized.city;
    normalized.all_cities = true;
  } else if (normalizedCity) {
    normalized.city = normalizedCity;
    delete normalized.all_cities;
  }
  if (normalized.language) {
    normalized.language = canonicalLanguageFromText(normalized.language) || String(normalized.language).trim().toLowerCase();
  }
  return normalized;
}

function clearSelectedBookingFromIntent(intent = {}) {
  const cleared = normalizeBotIntent(intent);
  delete cleared.movie_title;
  delete cleared.cinema_name;
  delete cleared.time_of_day;
  delete cleared.date;
  delete cleared.selected_show_id;
  delete cleared.movie_confirmed;
  delete cleared.cinema_confirmed;
  delete cleared.time_confirmed;
  delete cleared.checkoutPayload;
  cleared.current_offset = 0;
  return cleared;
}

function isNewSearchDuringConfirmation(promptText = '') {
  const text = String(promptText).toLowerCase();
  if (/\b(movie|movies|show me|find|search|latest|newest|new release)\b/.test(text)) return true;
  if (Object.keys(LANGUAGE_ALIASES).some(lang => new RegExp(`\\b${lang}\\b`).test(text))) return true;
  if (GENRE_ALIASES.some(genre => text.includes(genre))) return true;
  return false;
}

function isCinemaListRequest(promptText = '') {
  const text = String(promptText).toLowerCase();
  return /\b(theatres|theaters|cinemas|multiplexes|halls)\b/.test(text) &&
    /\b(which|what|list|show|available|present|in)\b/.test(text);
}

function isMovieListRequest(promptText = '') {
  const text = String(promptText).toLowerCase();
  const hasMovieWord = /\b(movie|movies|films|film)\b/.test(text);
  const asksToList = /\b(what|which|list|show|available|present|currently|now|running|playing)\b/.test(text);
  const looksLikeCategoryRequest = /\bmovies\b/.test(text) && !/\b(book|ticket|tickets|seat|seats)\b/.test(text);
  return hasMovieWord && (asksToList || looksLikeCategoryRequest);
}

function inferFallbackQueryIntent(promptText = '', intent = {}) {
  const text = String(promptText).toLowerCase();
  if (/\b(snack|snacks|food|popcorn|drinks|coke|pepsi|nachos)\b/.test(text) &&
      /\b(what|which|list|show|available|present|menu|have|get)\b/.test(text)) {
    return 'snack_search';
  }
  if (isCinemaListRequest(promptText)) return 'cinema_search';
  if (isMovieListRequest(promptText) || intent.genre || intent.language || intent.sort_preference === 'latest_release') {
    return 'movie_search';
  }
  if (intent.movie_title || intent.city || intent.cinema_name || intent.date || intent.time_of_day) {
    return intent.quantity ? 'booking_checkout' : 'show_search';
  }
  return null;
}

function showDateLabel(showTime) {
  const today = new Date();
  const tomorrow = addDays(today, 1);
  const showDateKey = zonedDateKey(showTime);
  if (showDateKey === zonedDateKey(today)) return 'Today';
  if (showDateKey === zonedDateKey(tomorrow)) return 'Tomorrow';
  return formatDateInAppZone(showTime);
}

function inferSeatPreference(promptText = '', currentSeats = []) {
  const text = String(promptText).toLowerCase();
  const asksForSeats = SEAT_CHANGE_PATTERN.test(text);
  const preference = {};

  if (/\b(vip|luxury)\b/.test(text)) preference.seat_type = 'VIP';
  else if (/\bpremium\b/.test(text)) preference.seat_type = 'Premium';
  else if (/\b(regular|normal|cheap|cheapest|budget)\b/.test(text)) preference.seat_type = 'Regular';

  if (/\b(back|rear|last)\b/.test(text)) preference.row_zone = 'back';
  else if (/\b(front|first)\b/.test(text)) preference.row_zone = 'front';
  else if (/\b(middle|center|centre)\b/.test(text)) preference.row_zone = 'middle';

  const rowMatch = text.match(/\brow\s*([a-z])\b/i) || text.match(/\b([a-z])\s*row\b/i);
  if (rowMatch) preference.row_no = rowMatch[1].toUpperCase();

  if (/\b(together|adjacent|same row|side by side)\b/.test(text)) preference.keep_together = true;

  if (/\b(change|different|other|another|switch|move)\b/.test(text)) {
    const currentRows = [...new Set(currentSeats.map(s => s.row_no).filter(Boolean))];
    const currentSeatIds = currentSeats.map(s => s.seat_id).filter(Boolean);
    if (currentRows.length > 0) preference.avoid_rows = currentRows;
    if (currentSeatIds.length > 0) preference.avoid_seat_ids = currentSeatIds;
  }

  return { hasSeatRequest: asksForSeats, preference };
}

function seatSortValue(seat, preference = {}, rowRank = new Map(), totalRows = 1) {
  let score = 0;
  const seatTypeRank = { VIP: 0, Premium: 1, Regular: 2 };
  const rank = rowRank.get(seat.row_no) ?? 0;

  if (preference.avoid_seat_ids?.includes(seat.seat_id)) score += 100000;
  if (preference.avoid_rows?.includes(seat.row_no)) score += 30000;
  if (preference.row_no) score += seat.row_no === preference.row_no ? 0 : 50000;
  if (preference.seat_type) score += seat.seat_type === preference.seat_type ? 0 : 25000;

  if (preference.row_zone === 'front') score += rank * 100;
  else if (preference.row_zone === 'back') score += (totalRows - rank) * 100;
  else if (preference.row_zone === 'middle') score += Math.abs(rank - ((totalRows - 1) / 2)) * 100;
  else score += (seatTypeRank[seat.seat_type] ?? 3) * 100;

  score += rank;
  score += parseInt(seat.seat_no, 10) || 0;
  return score;
}

function chooseSeatsByPreference(availableSeats, quantity, preference = {}) {
  const rows = [...new Set(availableSeats.map(s => s.row_no))].sort();
  const rowRank = new Map(rows.map((row, index) => [row, index]));
  const totalRows = Math.max(rows.length, 1);
  const sortSeats = seats => [...seats].sort((a, b) =>
    seatSortValue(a, preference, rowRank, totalRows) - seatSortValue(b, preference, rowRank, totalRows)
  );

  const rowGroups = rows.map(row => ({
    row,
    seats: sortSeats(availableSeats.filter(s => s.row_no === row))
  })).sort((a, b) =>
    seatSortValue(a.seats[0], preference, rowRank, totalRows) - seatSortValue(b.seats[0], preference, rowRank, totalRows)
  );

  const wantsTogether = preference.keep_together || preference.row_no || preference.row_zone || preference.avoid_rows?.length;
  if (wantsTogether) {
    const sameRow = rowGroups.find(group => group.seats.length >= quantity);
    if (sameRow) return sameRow.seats.slice(0, quantity);
  }

  return sortSeats(availableSeats).slice(0, quantity);
}

function buildSeatPreferenceClarification(intent, currentSeats = []) {
  const currentRows = [...new Set(currentSeats.map(s => s.row_no).filter(Boolean))];
  const currentSeatIds = currentSeats.map(s => s.seat_id).filter(Boolean);
  const basePreference = {
    avoid_rows: currentRows,
    avoid_seat_ids: currentSeatIds,
    keep_together: true
  };
  const optionValues = {
    'Back row': { seat_preference: { ...basePreference, row_zone: 'back' } },
    'Middle row': { seat_preference: { ...basePreference, row_zone: 'middle' } },
    'Front row': { seat_preference: { ...basePreference, row_zone: 'front' } },
    'VIP seats': { seat_preference: { ...basePreference, seat_type: 'VIP' } },
    'Premium seats': { seat_preference: { ...basePreference, seat_type: 'Premium' } },
    'Regular seats': { seat_preference: { ...basePreference, seat_type: 'Regular' } },
    'Any different seats': { seat_preference: basePreference },
  };
  return {
    type: 'clarify',
    message: 'Sure. What kind of seats should I try instead?',
    options: Object.keys(optionValues),
    context: buildOptionContext(normalizeBotIntent(intent), 'seat_preference', optionValues)
  };
}

// ---------------------------------------------------------
// JWT Auth Middleware
// ---------------------------------------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer <token>
  if (!token) return res.status(401).json({ error: 'Access denied. Please log in.' });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Invalid or expired token. Please log in again.' });
    req.user = user; // { user_id, name, email, role }
    next();
  });
};

const authenticateAdmin = (req, res, next) => {
  authenticateToken(req, res, async () => {
    try {
      const result = await query('SELECT role FROM users WHERE user_id = $1', [req.user.user_id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'User not found.' });
      }
      if (result.rows[0].role !== 'admin') {
        return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
      }
      req.user.role = result.rows[0].role;
      next();
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: 'Could not verify admin privileges.' });
    }
  });
};

// ---------------------------------------------------------
// Auth Routes
// ---------------------------------------------------------

// POST /api/auth/register
app.post('/api/auth/register', async (req, res) => {
  const { name, email, password, phone } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email and password are required.' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters.' });
  }
  try {
    // Check if email already exists
    const existing = await query('SELECT user_id FROM users WHERE email = $1', [email]);
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }

    const password_hash = await bcrypt.hash(password, 10);
    const result = await query(
      'INSERT INTO users (name, email, password_hash, phone, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email, phone, role, created_at',
      [name, email, password_hash, phone || null, 'user']
    );
    const user = result.rows[0];

    const token = jwt.sign(
      { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({ token, user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// POST /api/auth/login
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, role, password_hash FROM users WHERE email = $1',
      [email]
    );
    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(401).json({ error: 'This account was created without a password. Please register again.' });
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { user_id: user.user_id, name: user.name, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    const { password_hash, ...safeUser } = user;
    res.json({ token, user: safeUser });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// GET /api/auth/me — verify token, return current user
app.get('/api/auth/me', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, city, role, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch user.' });
  }
});

// GET /api/user/profile — current user's profile details
app.get('/api/user/profile', authenticateToken, async (req, res) => {
  try {
    const result = await query(
      'SELECT user_id, name, email, phone, city, role, created_at FROM users WHERE user_id = $1',
      [req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not fetch profile.' });
  }
});

// PUT /api/user/profile — update current user's profile details
app.put('/api/user/profile', authenticateToken, async (req, res) => {
  const { name, phone, city } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: 'Name is required.' });
  }

  try {
    const result = await query(
      `UPDATE users
       SET name = $1, phone = $2, city = $3
       WHERE user_id = $4
       RETURNING user_id, name, email, phone, city, role, created_at`,
      [name.trim(), phone || null, city || null, req.user.user_id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update profile.' });
  }
});

// GET /api/user/bookings — user's own bookings with movie/cinema info
app.get('/api/user/bookings', authenticateToken, async (req, res) => {
  try {
    const sql = `
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             p.status as payment_status, p.method as payment_method, p.transaction_ref,
             m.title, m.poster_url,
             c.name as cinema_name, c.city,
             sc.name as screen_name,
             s.show_time,
             (
                SELECT json_agg(json_build_object('row_no', st.row_no, 'seat_no', st.seat_no))
                FROM tickets t
                JOIN seats st ON t.seat_id = st.seat_id
                WHERE t.booking_id = b.booking_id
             ) as seats
      FROM bookings b
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      WHERE b.user_id = $1
      ORDER BY b.booking_time DESC
    `;
    const { rows } = await query(sql, [req.user.user_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

// GET /api/user/loyalty — user's loyalty point balance
app.get('/api/user/loyalty', authenticateToken, async (req, res) => {
  try {
    const db = { query };
    const redeemableAt = await getLoyaltyRedeemableAt(db);
    const balance = await getLoyaltyBalance(db, req.user.user_id, redeemableAt);
    res.json({ balance });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch loyalty balance' });
  }
});

// ---------------------------------------------------------
// Admin Routes
// ---------------------------------------------------------

// Get Admin Stats
app.get('/api/admin/stats', authenticateAdmin, async (req, res) => {
  try {
    const revenueRes = await pool.query('SELECT SUM(total_amount) as total_revenue FROM bookings WHERE status = $1', ['Confirmed']);
    const bookingsRes = await pool.query('SELECT COUNT(*) as total_bookings FROM bookings WHERE status = $1', ['Confirmed']);
    const moviesRes = await pool.query('SELECT COUNT(*) as total_movies FROM movies');
    const usersRes = await pool.query('SELECT COUNT(*) as total_users FROM users');
    const cityRevRes = await pool.query('SELECT * FROM v_revenue_by_city ORDER BY revenue DESC');
    const occupancyRes = await pool.query('SELECT * FROM v_show_occupancy WHERE show_time >= NOW() ORDER BY occupancy_percent DESC LIMIT 10');

    res.json({
      totalRevenue: revenueRes.rows[0].total_revenue || 0,
      totalBookings: bookingsRes.rows[0].total_bookings,
      totalMovies: moviesRes.rows[0].total_movies,
      totalUsers: usersRes.rows[0].total_users,
      cityRevenue: cityRevRes.rows,
      topOccupancy: occupancyRes.rows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

// Get Admin Waitlists
app.get('/api/admin/waitlists', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT w.waitlist_id, w.status, w.joined_at, w.requested_seats,
             u.name as user_name, u.email as user_email,
             s.show_id, s.show_time,
             m.title as movie_title
      FROM waitlist w
      JOIN users u ON w.user_id = u.user_id
      JOIN shows s ON w.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      ORDER BY w.joined_at DESC
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch waitlists' });
  }
});

app.get('/api/admin/reports', authenticateAdmin, async (_req, res) => {
  try {
    const [cityRevenue, movieRevenue, cinemaRevenue, showOccupancy, topUsers] = await Promise.all([
      pool.query('SELECT * FROM v_revenue_by_city ORDER BY revenue DESC'),
      pool.query('SELECT * FROM v_revenue_by_movie ORDER BY revenue DESC, tickets_sold DESC LIMIT 20'),
      pool.query('SELECT * FROM v_revenue_by_cinema ORDER BY revenue DESC, tickets_sold DESC LIMIT 20'),
      pool.query('SELECT * FROM v_show_occupancy WHERE show_time >= NOW() ORDER BY occupancy_percent DESC, show_time ASC LIMIT 20'),
      pool.query('SELECT * FROM v_top_users ORDER BY total_spent DESC, confirmed_bookings DESC LIMIT 20'),
    ]);

    res.json({
      cityRevenue: cityRevenue.rows,
      movieRevenue: movieRevenue.rows,
      cinemaRevenue: cinemaRevenue.rows,
      showOccupancy: showOccupancy.rows,
      topUsers: topUsers.rows,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch DBMS reports' });
  }
});

app.get('/api/admin/audit-logs', authenticateAdmin, async (_req, res) => {
  try {
    const { rows } = await query(`
      SELECT a.*, u.name AS admin_name, u.email AS admin_email
      FROM admin_audit_logs a
      LEFT JOIN users u ON a.admin_id = u.user_id
      ORDER BY a.created_at DESC
      LIMIT 100
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

// Add New Movie
app.post('/api/admin/movies', authenticateAdmin, async (req, res) => {
  const { title, genre, duration_mins, language, poster_url, banner_url, overview } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Movie title is required' });
  }

  try {
    const result = await query(
      `INSERT INTO movies (title, genre, duration_mins, language, poster_url, banner_url, overview) 
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [title.trim(), genre || null, duration_mins || null, language || null, poster_url || null, banner_url || null, overview || null]
    );
    await logAdminAction(pool, req.user.user_id, 'CREATE_MOVIE', 'movie', result.rows[0].movie_id, {
      title: result.rows[0].title,
      genre: result.rows[0].genre,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add movie' });
  }
});

// Add New Show
// GET /api/admin/shows — upcoming shows with full detail for admin dashboard
app.get('/api/admin/shows', authenticateAdmin, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.show_id, s.show_time, s.base_price, s.available_seats,
             m.title, m.language,
             sc.name AS screen_name, sc.total_seats,
             c.name AS cinema_name, c.city
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_time >= NOW()
      ORDER BY s.show_time ASC
      LIMIT 500
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch shows' });
  }
});

app.post('/api/admin/shows', authenticateAdmin, async (req, res) => {
  const { movie_id, screen_id, show_time, base_price } = req.body;
  const parsedBasePrice = Number(base_price);

  if (!isUuid(movie_id) || !isUuid(screen_id) || !show_time || !Number.isFinite(parsedBasePrice) || parsedBasePrice <= 0) {
    return res.status(400).json({ error: 'movie_id, screen_id, show_time and a positive base_price are required' });
  }

  try {
    // Basic validation: check if screen is busy at that time
    const check = await query('SELECT * FROM shows WHERE screen_id = $1 AND show_time = $2', [screen_id, show_time]);
    if (check.rows.length > 0) return res.status(409).json({ error: 'Screen is already occupied at this time' });

    const screenRes = await query('SELECT total_seats FROM screens WHERE screen_id = $1', [screen_id]);
    if (screenRes.rows.length === 0) return res.status(404).json({ error: 'Screen not found' });
    const available_seats = screenRes.rows[0].total_seats;

    const result = await query(
      `INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats) 
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [movie_id, screen_id, show_time, parsedBasePrice, available_seats]
    );
    await logAdminAction(pool, req.user.user_id, 'CREATE_SHOW', 'show', result.rows[0].show_id, {
      movie_id,
      screen_id,
      show_time,
      base_price: parsedBasePrice,
    });
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to add show' });
  }
});

// Update show pricing
app.patch('/api/admin/shows/:id', authenticateAdmin, async (req, res) => {
  const { base_price } = req.body;
  const parsedBasePrice = Number(base_price);

  if (!Number.isFinite(parsedBasePrice) || parsedBasePrice <= 0) {
    return res.status(400).json({ error: 'base_price must be a positive number' });
  }

  try {
    const result = await query(
      'UPDATE shows SET base_price = $1 WHERE show_id = $2 RETURNING *',
      [parsedBasePrice, req.params.id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Show not found' });
    await logAdminAction(pool, req.user.user_id, 'UPDATE_SHOW_PRICE', 'show', result.rows[0].show_id, {
      base_price: parsedBasePrice,
    });
    res.json(result.rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update show price' });
  }
});

// Get All Bookings for Admin
app.get('/api/admin/bookings', authenticateAdmin, async (req, res) => {
  try {
    const sql = `
      SELECT b.booking_id, b.total_amount, b.status, b.booking_time,
             p.status as payment_status, p.method as payment_method,
             u.name as user_name, u.email as user_email,
             m.title as movie_title,
             c.name as cinema_name
      FROM bookings b
      JOIN users u ON b.user_id = u.user_id
      JOIN shows s ON b.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      LEFT JOIN payments p ON b.booking_id = p.booking_id
      ORDER BY b.booking_time DESC
    `;
    const { rows } = await query(sql);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch all bookings' });
  }
});

// ---------------------------------------------------------
// Basic Endpoints
// ---------------------------------------------------------

// Get all movies (supports ?city= filter)
app.get('/api/movies', async (req, res) => {
  try {
    const city = req.query.city;
    let queryStr = 'SELECT * FROM movies';
    let params = [];

    if (city && city !== 'All') {
      // Find movies that have shows in the selected city, OR are coming soon (no shows needed)
      queryStr = `
        SELECT DISTINCT m.* 
        FROM movies m
        LEFT JOIN shows s ON m.movie_id = s.movie_id
        LEFT JOIN screens sc ON s.screen_id = sc.screen_id
        LEFT JOIN cinemas c ON sc.cinema_id = c.cinema_id
        WHERE c.city ILIKE $1 OR m.release_date > CURRENT_DATE
      `;
      params = [city];
    }

    const { rows } = await query(queryStr, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single movie
app.get('/api/movies/:id', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM movies WHERE movie_id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Movie not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/movies/:id/rate — authenticated users submit a rating (1-10)
app.post('/api/movies/:id/rate', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { rating } = req.body;
  const parsedRating = Number(rating);
  if (!Number.isFinite(parsedRating) || parsedRating < 1 || parsedRating > 10) {
    return res.status(400).json({ error: 'Rating must be a number between 1 and 10' });
  }
  try {
    // Update running average: new_avg = (old_avg * old_count + new_rating) / (old_count + 1)
    const result = await query(
      `UPDATE movies
       SET vote_average = ROUND(((vote_average * vote_count) + $1) / (vote_count + 1), 1),
           vote_count   = vote_count + 1
       WHERE movie_id = $2
       RETURNING vote_average, vote_count`,
      [parsedRating, id]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'Movie not found' });
    res.json({ success: true, vote_average: result.rows[0].vote_average, vote_count: result.rows[0].vote_count });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});


app.get('/api/cinemas', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM cinemas');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all screens with cinema info
app.get('/api/screens', async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT s.*, c.name as cinema_name 
      FROM screens s 
      JOIN cinemas c ON s.cinema_id = c.cinema_id
      ORDER BY c.name, s.name
    `);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get trending TV shows for Stream page
app.get('/api/stream', async (req, res) => {
  try {
    const TMDB_API_KEY = process.env.TMDB_API_KEY;
    if (!TMDB_API_KEY) return res.json([]);

    const response = await fetch(`https://api.themoviedb.org/3/trending/tv/day?api_key=${TMDB_API_KEY}`);
    const data = await response.json();
    res.json(data.results || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch stream data' });
  }
});

// Get shows for a movie (supports ?date= and ?city= filter)
app.get('/api/shows/movie/:movie_id', async (req, res) => {
  try {
    const { movie_id } = req.params;
    const { date, city } = req.query; // expects YYYY-MM-DD

    let sql = `
      SELECT s.show_id, s.show_time, s.base_price, s.available_seats, s.surge_multiplier,
             sc.name as screen_name, c.name as cinema_name, c.city, c.address, c.cinema_id
      FROM shows s
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.movie_id = $1
    `;
    const params = [movie_id];
    let paramIdx = 2;

    if (date) {
      sql += ` AND DATE(s.show_time) = $${paramIdx} AND s.show_time > NOW()`;
      params.push(date);
      paramIdx++;
    } else {
      sql += ` AND s.show_time > NOW()`;
    }

    if (city && city !== 'All') {
      sql += ` AND c.city ILIKE $${paramIdx}`;
      params.push(city);
      paramIdx++;
    }

    sql += ` ORDER BY c.name, s.show_time`;

    const { rows } = await query(sql, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get single show details (for seat layout header)
app.get('/api/shows/:show_id', async (req, res) => {
  try {
    const sql = `
      SELECT s.show_id, s.show_time, s.base_price, s.surge_multiplier, s.available_seats,
             m.title, m.poster_url, m.duration_mins, m.language,
             sc.name as screen_name, c.name as cinema_name, c.city, c.address
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_id = $1
    `;
    const { rows } = await query(sql, [req.params.show_id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Show not found' });
    res.json(rows[0]);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get seat layout and status for a show
app.get('/api/seats/:show_id', async (req, res) => {
  try {
    const showId = req.params.show_id;
    let userId = null;
    const authHeader = req.headers['authorization'];
    if (authHeader) {
      const token = authHeader.split(' ')[1];
      if (token) {
        try {
          const user = jwt.verify(token, JWT_SECRET);
          userId = user.user_id;
        } catch (e) {} // ignore invalid token for optional auth
      }
    }

    await query('SELECT expire_seat_holds()');
    // Get all seats for the screen hosting the show
    const seatsSql = `
      SELECT s.seat_id, s.row_no, s.seat_no, s.seat_type, s.price_multiplier,
             (CASE WHEN t.ticket_id IS NOT NULL THEN true ELSE false END) as is_booked,
             (CASE WHEN h.hold_id IS NOT NULL THEN true ELSE false END) as is_held,
             (CASE WHEN h.user_id = $2 THEN true ELSE false END) as is_held_by_me
      FROM seats s
      JOIN shows sh ON s.screen_id = sh.screen_id
      LEFT JOIN tickets t ON t.seat_id = s.seat_id 
           AND t.show_id = $1
           AND t.booking_id IN (SELECT booking_id FROM bookings WHERE status = 'Confirmed')
      LEFT JOIN seat_holds h ON h.seat_id = s.seat_id
           AND h.show_id = $1
           AND h.status = 'Active'
           AND h.expires_at > NOW()
      WHERE sh.show_id = $1
      ORDER BY s.row_no, s.seat_no
    `;
    const { rows } = await query(seatsSql, [showId, userId]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all snacks
app.get('/api/snacks', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM snacks');
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// Autonomous Booking System Endpoint
// ---------------------------------------------------------
app.post('/api/autonomous-booking', async (req, res) => {
  // Expected body:
  // { city: 'Mumbai', startTime: '2023-10-27T18:00:00', endTime: '2023-10-27T23:00:00', genre: 'Sci-Fi' }
  const { city, startTime, endTime, genre } = req.body;

  try {
    // A complex query to find best matching shows
    const sql = `
      SELECT 
        s.show_id, m.title, m.genre, m.poster_url, m.banner_url, c.name AS cinema_name, c.city,
        sc.name AS screen_name, s.show_time, s.base_price, s.available_seats, s.surge_multiplier
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE 
        c.city ILIKE $1
        AND s.show_time >= $2::timestamp
        AND s.show_time <= $3::timestamp
        AND ($4::varchar IS NULL OR m.genre ILIKE $4)
        AND s.available_seats > 0
      ORDER BY s.surge_multiplier ASC, s.show_time ASC
      LIMIT 3;
    `;

    // Fallback times if not provided properly (just for demo)
    const st = startTime || new Date().toISOString();
    const et = endTime || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // 1 week

    const { rows } = await query(sql, [city, st, et, genre || null]);

    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ---------------------------------------------------------
// Booking & Transaction Management
// ---------------------------------------------------------
// Hold seats for a short checkout window.
app.post('/api/seat-holds', authenticateToken, async (req, res) => {
  const { show_id, seat_ids } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.length === 0 || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  const uniqueSeatIds = [...new Set(seat_ids)].sort();
  const client = await pool.connect();

  try {
    await client.query('BEGIN');
    await client.query('SELECT expire_seat_holds()');

    const showRes = await client.query('SELECT screen_id FROM shows WHERE show_id = $1 FOR UPDATE', [show_id]);
    if (showRes.rows.length === 0) throw new Error('Show not found');
    const show = showRes.rows[0];

    const holds = [];
    for (const seat_id of uniqueSeatIds) {
      const seatRes = await client.query('SELECT screen_id FROM seats WHERE seat_id = $1', [seat_id]);
      if (seatRes.rows.length === 0) throw new Error('Invalid seat');
      if (seatRes.rows[0].screen_id !== show.screen_id) throw new Error('Seat does not belong to this show');

      const bookedRes = await client.query(`
        SELECT t.ticket_id
        FROM tickets t
        JOIN bookings b ON t.booking_id = b.booking_id
        WHERE t.show_id = $1 AND t.seat_id = $2 AND b.status = 'Confirmed'
      `, [show_id, seat_id]);
      if (bookedRes.rows.length > 0) throw new Error('Seat already booked');

      const activeHoldRes = await client.query(`
        SELECT hold_id, user_id
        FROM seat_holds
        WHERE show_id = $1
          AND seat_id = $2
          AND status = 'Active'
          AND expires_at > NOW()
        FOR UPDATE
      `, [show_id, seat_id]);

      if (activeHoldRes.rows.length > 0 && activeHoldRes.rows[0].user_id !== user_id) {
        throw new Error('Seat is temporarily held by another user');
      }

      const holdRes = await client.query(`
        INSERT INTO seat_holds (show_id, seat_id, user_id, expires_at)
        VALUES ($1, $2, $3, NOW() + ($4 || ' minutes')::INTERVAL)
        ON CONFLICT (show_id, seat_id) WHERE status = 'Active'
        DO UPDATE SET
          user_id = EXCLUDED.user_id,
          hold_token = gen_random_uuid(),
          expires_at = EXCLUDED.expires_at,
          released_at = NULL
        WHERE seat_holds.user_id = EXCLUDED.user_id
        RETURNING hold_id, seat_id, hold_token, expires_at
      `, [show_id, seat_id, user_id, HOLD_MINUTES]);

      if (holdRes.rows.length === 0) throw new Error('Seat is temporarily held by another user');
      holds.push(holdRes.rows[0]);
    }

    await client.query('COMMIT');
    res.json({ success: true, holds, expiresInMinutes: HOLD_MINUTES });
  } catch (err) {
    await client.query('ROLLBACK');
    const status = /booked|held/i.test(err.message) ? 409 : 400;
    res.status(status).json({ error: err.message });
  } finally {
    client.release();
  }
});

app.delete('/api/seat-holds', authenticateToken, async (req, res) => {
  const { show_id, seat_ids } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  try {
    const result = await query(`
      UPDATE seat_holds
      SET status = 'Released', released_at = NOW()
      WHERE show_id = $1
        AND user_id = $2
        AND seat_id = ANY($3)
        AND status = 'Active'
      RETURNING hold_id
    `, [show_id, user_id, seat_ids]);
    res.json({ success: true, released: result.rowCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to release seat holds' });
  }
});

// Book tickets
app.post('/api/bookings', authenticateToken, async (req, res) => {
  const { show_id, seat_ids, snack_ids, applyPoints, payment_method } = req.body;
  const user_id = req.user.user_id;

  if (!isUuid(show_id) || !Array.isArray(seat_ids) || seat_ids.length === 0 || seat_ids.some(id => !isUuid(id))) {
    return res.status(400).json({ error: 'show_id and valid seat_ids are required' });
  }

  const uniqueSeatIds = [...new Set(seat_ids)].sort();
  if (uniqueSeatIds.length !== seat_ids.length) {
    return res.status(400).json({ error: 'Duplicate seats are not allowed' });
  }

  const paymentMethod = PAYMENT_METHODS.has(payment_method) ? payment_method : 'Demo';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const redeemableAt = await getLoyaltyRedeemableAt(client);
    await client.query('SELECT expire_seat_holds()');
    await client.query('SELECT expire_pending_bookings()');

    // 1. Get show details and lock the row
    const showRes = await client.query(
      'SELECT screen_id, base_price, surge_multiplier, available_seats FROM shows WHERE show_id = $1 FOR UPDATE',
      [show_id]
    );
    if (showRes.rows.length === 0) throw new Error('Show not found');
    const show = showRes.rows[0];

    if (show.available_seats < seat_ids.length) {
      throw new Error('Not enough seats available');
    }

    let surgeMultiplier = parseFloat(show.surge_multiplier) || 1.0;
    let ticketsTotal = 0;
    let finalTickets = [];

    for (let seat_id of uniqueSeatIds) {
      const seatRes = await client.query('SELECT price_multiplier, screen_id FROM seats WHERE seat_id = $1', [seat_id]);
      if (seatRes.rows.length === 0) throw new Error('Invalid seat');
      if (seatRes.rows[0].screen_id !== show.screen_id) throw new Error('Seat does not belong to this show');
      
      const isBooked = await client.query(`
         SELECT t.ticket_id FROM tickets t
         JOIN bookings b ON t.booking_id = b.booking_id
         WHERE t.show_id = $1 AND b.status = 'Confirmed' AND t.seat_id = $2
       `, [show_id, seat_id]);
      if (isBooked.rows.length > 0) throw new Error('Seat already booked');

      const activeHoldRes = await client.query(`
        SELECT hold_id, user_id
        FROM seat_holds
        WHERE show_id = $1
          AND seat_id = $2
          AND status = 'Active'
          AND expires_at > NOW()
        FOR UPDATE
      `, [show_id, seat_id]);
      if (activeHoldRes.rows.length > 0 && activeHoldRes.rows[0].user_id !== user_id) {
        throw new Error('Seat is temporarily held by another user');
      }

      const seatPrice = parseFloat(show.base_price) * parseFloat(seatRes.rows[0].price_multiplier) * surgeMultiplier;
      ticketsTotal += seatPrice;
      finalTickets.push({ seat_id, price: seatPrice });
    }

    // 4. Calculate Snacks
    let snacksTotal = 0;
    if (snack_ids && snack_ids.length > 0) {
      const snackUuids = snack_ids.map(s => s.id);
      const snackRes = await client.query('SELECT snack_id, price FROM snacks WHERE snack_id = ANY($1)', [snackUuids]);
      
      snacksTotal = snackRes.rows.reduce((sum, s) => {
        const orderedSnack = snack_ids.find(reqSnack => reqSnack.id === s.snack_id);
        const qty = orderedSnack ? orderedSnack.quantity : 1;
        return sum + (parseFloat(s.price) * qty);
      }, 0);
    }

    let totalAmount = ticketsTotal + snacksTotal;

    // 5. Apply Loyalty Points
    let pointsToSpend = 0;
    if (applyPoints) {
      await lockUserLoyaltyLedger(client, user_id);
      const balance = await getLoyaltyBalance(client, user_id, redeemableAt);
      if (balance <= 0) {
        throw new Error('Not enough loyalty points');
      }
      if (balance > 0) {
        const POINTS_MULTIPLIER = 0.10; // 50 points = 5 rupees
        const MAX_DISCOUNT_RUPEES = 100; 
        
        let maxPossibleDiscount = balance * POINTS_MULTIPLIER;
        let actualDiscount = Math.min(maxPossibleDiscount, MAX_DISCOUNT_RUPEES, totalAmount);
        
        if (actualDiscount > 0) {
          pointsToSpend = Math.ceil(actualDiscount / POINTS_MULTIPLIER);
          if (pointsToSpend > balance) {
            throw new Error('Not enough loyalty points');
          }
          totalAmount -= actualDiscount;
        }
      }
    }

    // 6. Create Booking (Pending)
    const bookingRes = await client.query(
      'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING booking_id',
      [user_id, show_id, totalAmount, 'Pending']
    );
    const bookingId = bookingRes.rows[0].booking_id;

    // Insert Spent Points into Ledger
    if (pointsToSpend > 0) {
      await client.query(
        'INSERT INTO loyalty_ledger (user_id, booking_id, points_spent, expires_at) VALUES ($1, $2, $3, NULL)',
        [user_id, bookingId, pointsToSpend]
      );
    }

    for (const seat of finalTickets) {
      await client.query(
        'INSERT INTO tickets (booking_id, show_id, seat_id, final_price) VALUES ($1, $2, $3, $4)',
        [bookingId, show_id, seat.seat_id, seat.price]
      );
    }

    // 7. Insert Booking Snacks BEFORE confirming
    if (snack_ids && snack_ids.length > 0) {
      for (let snack of snack_ids) {
        await client.query(
          'INSERT INTO booking_snacks (booking_id, snack_id, quantity) VALUES ($1, $2, $3)',
          [bookingId, snack.id, snack.quantity]
        );
      }
    }

    // 8. Confirm booking — this fires the DB trigger for seat count & surge pricing & loyalty points
    await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Confirmed', bookingId]);

    await client.query(
      `INSERT INTO payments (booking_id, amount, method, status, paid_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [bookingId, totalAmount, paymentMethod, 'Paid']
    );

    await client.query(`
      UPDATE seat_holds
      SET status = 'Converted', released_at = NOW()
      WHERE show_id = $1
        AND user_id = $2
        AND seat_id = ANY($3)
        AND status = 'Active'
    `, [show_id, user_id, uniqueSeatIds]);

    await client.query('COMMIT');
    res.json({ success: true, booking_id: bookingId, totalAmount, paymentStatus: 'Paid', message: 'Booking confirmed!' });

  } catch (err) {
    await client.query('ROLLBACK');
    console.error(err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'One or more selected seats were just booked. Please choose different seats.' });
    }
    if (/booked|held|available|loyalty points/i.test(err.message)) {
      return res.status(409).json({ error: err.message });
    }
    res.status(500).json({ error: 'Booking failed. Please try again.' });
  } finally {
    client.release();
  }
});

// ---------------------------------------------------------
// Waitlist Management
app.get('/api/user/waitlist', authenticateToken, async (req, res) => {
  try {
    const { rows } = await query(`
      SELECT w.waitlist_id, w.status, w.joined_at, w.requested_seats,
             s.show_id, s.show_time,
             m.title, m.title as movie_title, m.poster_url,
             c.city, c.name as cinema_name
      FROM waitlist w
      JOIN shows s ON w.show_id = s.show_id
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE w.user_id = $1
      ORDER BY w.joined_at DESC
    `, [req.user.user_id]);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch waitlist' });
  }
});

// ---------------------------------------------------------
app.post('/api/waitlist', authenticateToken, async (req, res) => {
  const { show_id, requested_seats } = req.body;
  const user_id = req.user.user_id;

  if (!show_id || !requested_seats) {
    return res.status(400).json({ error: 'show_id and requested_seats are required' });
  }

  try {
    const result = await query(
      'INSERT INTO waitlist (show_id, user_id, requested_seats) VALUES ($1, $2, $3) RETURNING waitlist_id',
      [show_id, user_id, requested_seats]
    );
    res.json({ success: true, message: 'Successfully joined the waitlist!' });
  } catch (err) {
    console.error('Waitlist Error:', err);
    if (err.code === '23505') {
      return res.status(409).json({ error: 'You are already on the waitlist for this show.' });
    }
    res.status(500).json({ error: 'Failed to join waitlist' });
  }
});

// ---------------------------------------------------------
// Cancellation & Auto-Booking Waitlist Engine
// ---------------------------------------------------------
app.post('/api/bookings/:id/cancel', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const user_id = req.user.user_id;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Verify booking
    const bookingRes = await client.query('SELECT * FROM bookings WHERE booking_id = $1 AND user_id = $2 FOR UPDATE', [id, user_id]);
    if (bookingRes.rows.length === 0) throw new Error('Booking not found');
    const booking = bookingRes.rows[0];

    if (booking.status === 'Cancelled') throw new Error('Already cancelled');

    // 2. Mark as cancelled
    await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Cancelled', id]);
    await client.query(`
      UPDATE payments
      SET status = 'Refunded',
          refund_amount = amount,
          refunded_at = NOW()
      WHERE booking_id = $1
        AND status = 'Paid'
    `, [id]);
    await logAdminAction(client, null, 'CANCEL_BOOKING', 'booking', id, {
      user_id,
      show_id: booking.show_id,
    });
    await logAdminAction(client, null, 'REFUND_PAYMENT', 'booking', id, {
      reason: 'User cancellation',
    });

    // Note: The postgres trigger 'update_show_availability_and_surge' fires here 
    // and adds seats back to available_seats!
    // Delete released tickets after the trigger has counted them so UNIQUE(show_id, seat_id)
    // allows those seats to be booked again.
    await client.query('DELETE FROM tickets WHERE booking_id = $1', [id]);

    // 3. Auto-Booking Waitlist Engine
    // Fetch all Waiting users for this show
    const waitlistRes = await client.query(`
      SELECT * FROM waitlist 
      WHERE show_id = $1 AND status = 'Waiting'
      ORDER BY joined_at ASC
      FOR UPDATE SKIP LOCKED
    `, [booking.show_id]);

    for (let wlUser of waitlistRes.rows) {
      // Refresh available seats inside transaction
      const showRes = await client.query('SELECT available_seats, base_price, surge_multiplier, screen_id FROM shows WHERE show_id = $1 FOR UPDATE', [booking.show_id]);
      const show = showRes.rows[0];

      if (show.available_seats >= wlUser.requested_seats) {
         // Check for adjacent seats!
         const seatsRes = await client.query(`
            SELECT seat_id, row_no, seat_no, price_multiplier
            FROM seats 
            WHERE screen_id = $1
            AND seat_id NOT IN (
               SELECT t.seat_id FROM tickets t JOIN bookings b ON t.booking_id = b.booking_id WHERE t.show_id = $2 AND b.status = 'Confirmed'
            )
            AND seat_id NOT IN (
               SELECT h.seat_id FROM seat_holds h
               WHERE h.show_id = $2 AND h.status = 'Active' AND h.expires_at > NOW()
            )
            ORDER BY row_no ASC, seat_no ASC
         `, [show.screen_id, booking.show_id]);

         // Sliding window to find contiguous seats
         const seats = seatsRes.rows;
         let adjacentSeats = null;
         
         for (let i = 0; i <= seats.length - wlUser.requested_seats; i++) {
           let isContiguous = true;
           let currentWindow = [seats[i]];
           for (let j = 1; j < wlUser.requested_seats; j++) {
             if (seats[i+j].row_no !== seats[i].row_no || parseInt(seats[i+j].seat_no) !== parseInt(seats[i+j-1].seat_no) + 1) {
               isContiguous = false;
               break;
             }
             currentWindow.push(seats[i+j]);
           }
           if (isContiguous) {
             adjacentSeats = currentWindow;
             break;
           }
         }

         if (adjacentSeats) {
            const basePrice = parseFloat(show.base_price);
            const surgeMultiplier = parseFloat(show.surge_multiplier) || 1.0;
            const totalAmount = adjacentSeats.reduce(
              (sum, seat) => sum + (basePrice * parseFloat(seat.price_multiplier) * surgeMultiplier),
              0
            );

            // Auto-book!
            const newBookingRes = await client.query(
               'INSERT INTO bookings (user_id, show_id, total_amount, status) VALUES ($1, $2, $3, $4) RETURNING booking_id',
               [wlUser.user_id, booking.show_id, totalAmount, 'Pending']
            );
            const newBookingId = newBookingRes.rows[0].booking_id;
            
            for (let seat of adjacentSeats) {
               const finalPrice = basePrice * parseFloat(seat.price_multiplier) * surgeMultiplier;
               await client.query(
                  'INSERT INTO tickets (booking_id, show_id, seat_id, final_price) VALUES ($1, $2, $3, $4)',
                  [newBookingId, booking.show_id, seat.seat_id, finalPrice]
               );
            }

            // Confirm booking
            await client.query('UPDATE bookings SET status = $1 WHERE booking_id = $2', ['Confirmed', newBookingId]);
            await client.query(
              `INSERT INTO payments (booking_id, amount, method, status)
               VALUES ($1, $2, $3, $4)`,
              [newBookingId, totalAmount, 'Demo', 'Pending']
            );
            // Mark waitlist as Auto-Booked
            await client.query('UPDATE waitlist SET status = $1 WHERE waitlist_id = $2', ['Auto-Booked', wlUser.waitlist_id]);
         }
      }
    }

    await client.query('COMMIT');
    res.json({ message: 'Booking cancelled successfully. Waitlist processed.' });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(400).json({ error: err.message });
  } finally {
    client.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Gemini Reply Generator: given DB results, compose a natural sentence.
// Falls back to the provided fallbackMessage if Gemini fails or key is missing.
// ─────────────────────────────────────────────────────────────────────────────
async function generateBotReply(situation, fallbackMessage) {
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
  if (!GEMINI_API_KEY || GEMINI_API_KEY === 'your_gemini_api_key_here') return fallbackMessage;
  try {
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: 'gemini-2.5-flash',
      systemInstruction: `You are ShowsNow Concierge. Write ONE concise, friendly sentence presenting the given booking results to the user. 
Never invent data. Only use facts given to you. Keep it under 30 words. No bullet points. No markdown. Just a plain sentence.`,
      generationConfig: { temperature: 0.4 }
    });
    const result = await model.generateContent(situation);
    const text = result.response.text().trim();
    return text || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

// Autonomous booking assistant. Gemini handles conversation understanding;
// database-backed option maps keep booking choices exact and safe.
app.post('/api/autonomous-agent', async (req, res) => {
  try {
    const { prompt, context, isOption, history = [] } = req.body;
    const promptText = typeof prompt === 'string' ? prompt.trim() : '';
    if (!promptText && !context) {
      return res.json({ type: 'out_of_scope', message: BOT_OUT_OF_SCOPE_MESSAGE });
    }

    let intent = context ? { ...context } : {};
    let clarificationField = context?.clarification_field || null;
    let aiAssistantMessage = null;
    let aiMarkedOutOfScope = false;
    let unsupportedActorFilter = false;
    let aiExtractedBookingIntent = false;
    let searchMode = null;
    let seatPreferenceUpdated = false;

    const selectedOption = isOption && promptText ? selectedOptionFromContext(intent, promptText) : null;
    if (selectedOption?.action === 'checkout') {
      return res.json({
        type: 'checkout',
        message: 'Perfect. I am taking you to checkout now.',
        payload: selectedOption.checkoutPayload
      });
    }

    if (selectedOption?.action === 'more') {
      intent = {
        ...normalizeBotIntent(intent),
        current_offset: selectedOption.current_offset || ((intent.current_offset || 0) + 4),
      };
      clarificationField = selectedOption.clarification_field || clarificationField;
    } else if (selectedOption?.action === 'change_movie') {
      intent = normalizeBotIntent(intent);
      delete intent.movie_title;
      delete intent.cinema_name;
      delete intent.time_of_day;
      delete intent.date;
      delete intent.selected_show_id;
      delete intent.movie_confirmed;
      delete intent.cinema_confirmed;
      delete intent.time_confirmed;
      intent.current_offset = 0;
    } else if (selectedOption?.action === 'change_cinema') {
      intent = normalizeBotIntent(intent);
      delete intent.cinema_name;
      delete intent.time_of_day;
      delete intent.date;
      delete intent.selected_show_id;
      delete intent.cinema_confirmed;
      delete intent.time_confirmed;
      intent.current_offset = 0;
    } else if (selectedOption?.action === 'change_time') {
      intent = normalizeBotIntent(intent);
      delete intent.time_of_day;
      delete intent.date;
      delete intent.selected_show_id;
      delete intent.time_confirmed;
      intent.current_offset = 0;
    } else if (selectedOption?.action === 'change_quantity') {
      intent = normalizeBotIntent(intent);
      delete intent.quantity;
      delete intent.quantity_confirmed;
      intent.current_offset = 0;
    } else if (selectedOption?.action === 'change_seats') {
      return res.json(buildSeatPreferenceClarification(intent, intent.checkoutPayload?.selectedSeats || []));
    } else if (selectedOption) {
      intent = mergePresent(normalizeBotIntent(intent), selectedOption);
      intent = normalizeBotIntent(intent);
      clarificationField = null;
    } else if (isOption && clarificationField) {
      intent = mergePresent(normalizeBotIntent(intent), { [clarificationField]: promptText });
      intent = normalizeBotIntent(intent);
      clarificationField = null;
    } else if (promptText) {
      const lowerPrompt = promptText.toLowerCase();
      const explicitReset = lowerPrompt.includes('start over') || lowerPrompt.includes('cancel');
      const newSearchRequest = /^(find|search|show me)\b/.test(lowerPrompt) &&
        /\b(movie|movies|show|shows|ticket|tickets|cinema|cinemas)\b/.test(lowerPrompt) &&
        !/\b(more|next|other)\b/.test(lowerPrompt);
      if (explicitReset || newSearchRequest) {
        intent = {};
      }

      if (!isOption && clarificationField === 'seat_preference') {
        const currentSeats = intent.checkoutPayload?.selectedSeats || [];
        const seatRequest = inferSeatPreference(promptText, currentSeats);
        if (seatRequest.hasSeatRequest) {
          intent = mergePresent(normalizeBotIntent(intent), { seat_preference: seatRequest.preference });
          clarificationField = null;
          seatPreferenceUpdated = true;
        }
      }

      if (!isOption && clarificationField === 'checkout_confirmation') {
        const currentSeats = intent.checkoutPayload?.selectedSeats || [];
        const seatRequest = inferSeatPreference(promptText, currentSeats);
        const hasSpecificSeatPreference = Boolean(
          seatRequest.preference.row_zone ||
          seatRequest.preference.row_no ||
          seatRequest.preference.seat_type ||
          /\b(different|other|another)\b/i.test(promptText)
        );
        if (seatRequest.hasSeatRequest) {
          if (!hasSpecificSeatPreference) {
            return res.json(buildSeatPreferenceClarification(intent, currentSeats));
          }
          intent = mergePresent(normalizeBotIntent(intent), { seat_preference: seatRequest.preference });
          clarificationField = null;
          seatPreferenceUpdated = true;
        } else if (isNewSearchDuringConfirmation(promptText)) {
          intent = clearSelectedBookingFromIntent(intent);
          clarificationField = null;
        }
      }

      // ── GEMINI INTENT EXTRACTION (authoritative) ──────────────────────────
      // Build a snapshot of already-confirmed fields so Gemini knows what's locked.
      const confirmedFieldsSummary = [];
      if (intent.city) confirmedFieldsSummary.push(`city confirmed: ${intent.city}`);
      if (intent.movie_title) confirmedFieldsSummary.push(`movie confirmed: ${intent.movie_title}`);
      if (intent.cinema_name) confirmedFieldsSummary.push(`cinema confirmed: ${intent.cinema_name}`);
      if (intent.time_of_day && intent.time_confirmed) confirmedFieldsSummary.push(`showtime confirmed: ${intent.time_of_day}`);
      if (intent.quantity) confirmedFieldsSummary.push(`quantity confirmed: ${intent.quantity}`);
      if (intent.language) confirmedFieldsSummary.push(`language filter: ${intent.language}`);
      if (intent.genre) confirmedFieldsSummary.push(`genre filter: ${intent.genre}`);
      const confirmedContext = confirmedFieldsSummary.length > 0
        ? `\nAlready confirmed in this booking session:\n${confirmedFieldsSummary.map(f => `- ${f}`).join('\n')}`
        : '';

      const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
      const systemInstruction = `You are ShowsNow Concierge, a friendly movie-ticket booking assistant for an Indian cinema booking platform.
Use the conversation history to understand the user's latest request. Do not invent movies, cinemas, showtimes, seats, actors, or prices.
For every user message, first decide if it is booking-related, a correction to an existing booking flow, or normal conversation.
For normal conversation, greetings, thanks, or short non-booking messages, set all booking fields to null, set assistant_message to a brief natural reply, and set out_of_scope to false.
For unrelated requests you cannot help with, set out_of_scope to true and assistant_message to a brief redirection back to ShowsNow movie booking.
Use query_intent to tell the backend what database action to run:
- "movie_search": user asks what movies are available, asks for recommendations, asks by genre/language/latest/rating, or wants movie options before choosing.
- "cinema_search": user asks which cinemas/theatres/multiplexes are available, optionally in a city.
- "show_search": user asks for showtimes or availability for known filters but is not ready for checkout.
- "booking_checkout": user wants tickets and has or is giving booking details like movie, city, date, time, quantity, cinema, seats, or snacks.
- "snack_search": user asks about snacks/food/drinks/menu.
- "help": user asks what you can do.
IMPORTANT: Only extract fields the user mentioned in this message or recent history. Do NOT clear already-confirmed fields (shown below). If the user says "make it Telugu" when a movie is already confirmed, only set language, do not unset movie_title.
Return ONLY valid JSON with these EXACT fields:
- "query_intent": "movie_search" or "cinema_search" or "show_search" or "booking_checkout" or "snack_search" or "help" or null
- "movie_title": string or null
- "city": string or null
- "quantity": number or null
- "snack": string or null
- "genre": string or null
- "time_of_day": string or null
- "date": string or null
- "language": string or null
- "cinema_name": string or null
- "actor_name": string or null
- "sort_preference": "earliest" or "cheapest" or "best_rating" or "latest_release" or null
- "assistant_message": short natural-language reply or null (use this for greetings/conversational replies)
- "out_of_scope": boolean
- "reset": boolean (only true if user says "start over" or "cancel")
${confirmedContext}`;

      let geminiSucceeded = false;
      if (GEMINI_API_KEY && GEMINI_API_KEY !== 'your_gemini_api_key_here') {
        try {
          const safeHistory = Array.isArray(history)
            ? history.slice(-12).map(m => `${m.sender === 'user' ? 'user' : 'assistant'}: ${String(m.text || '').slice(0, 500)}`)
            : [];
          const conversationText = [...safeHistory, `user: ${promptText}`].join('\n');
          const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
          const model = genAI.getGenerativeModel({
            model: 'gemini-2.5-flash',
            systemInstruction,
            generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
          });
          const result = await model.generateContent(conversationText);
          const aiIntent = JSON.parse(result.response.text());
          geminiSucceeded = true;

          aiAssistantMessage = aiIntent.assistant_message || null;
          aiMarkedOutOfScope = Boolean(aiIntent.out_of_scope);
          unsupportedActorFilter = Boolean(aiIntent.actor_name);
          searchMode = normalizeQueryIntent(aiIntent.query_intent);

          aiExtractedBookingIntent = Boolean(
            searchMode ||
            aiIntent.movie_title ||
            aiIntent.city ||
            aiIntent.quantity ||
            aiIntent.snack ||
            aiIntent.genre ||
            aiIntent.time_of_day ||
            aiIntent.date ||
            aiIntent.language ||
            aiIntent.cinema_name ||
            aiIntent.sort_preference
          );

          if (aiIntent.reset) intent = {};

          // Gemini is authoritative — merge its values over the intent
          intent = mergePresent(normalizeBotIntent(intent), {
            movie_title: aiIntent.movie_title,
            city: aiIntent.city,
            quantity: aiIntent.quantity,
            snack: aiIntent.snack,
            genre: aiIntent.genre,
            time_of_day: aiIntent.time_of_day,
            date: aiIntent.date,
            language: aiIntent.language,
            cinema_name: aiIntent.cinema_name,
            sort_preference: aiIntent.sort_preference,
          });
          intent = normalizeBotIntent(intent);
        } catch (e) {
          console.warn('Gemini intent extraction failed, falling back to regex:', e.message);
        }
      }

      // ── REGEX FALLBACK (only if Gemini unavailable) ───────────────────────
      if (!geminiSucceeded) {
        const local = await extractLocalBookingIntent(promptText);
        const meaningfulLocalIntent = Boolean(
          local.intent.movie_title || local.intent.movie_options || local.intent.city ||
          local.intent.time_of_day || local.intent.date || local.intent.snack ||
          local.intent.genre || local.intent.language || local.intent.cinema_name || local.intent.quantity
        );
        searchMode = searchMode || inferFallbackQueryIntent(promptText, normalizeBotIntent(mergeMissing(normalizeBotIntent(intent), local.intent)));

        if (local.intent.movie_options?.length > 1 && !local.intent.movie_title && !intent.movie_title) {
          const optionValues = {};
          for (const title of local.intent.movie_options) {
            optionValues[title] = { movie_title: title, movie_confirmed: true, current_offset: 0 };
          }
          return res.json({
            type: 'clarify',
            message: 'I found more than one matching movie. Which one did you mean?',
            options: local.intent.movie_options,
            context: buildOptionContext(normalizeBotIntent(intent), 'movie_title', optionValues)
          });
        }

        delete local.intent.movie_options;
        if (local.intent.option_offset) {
          intent.current_offset = (intent.current_offset || 0) + 4;
          delete local.intent.option_offset;
        }
        if (/\b(latest|newest|new release|recent)\b/i.test(promptText)) {
          intent.sort_preference = 'latest_release';
        }
        intent = mergeMissing(normalizeBotIntent(intent), local.intent);
        intent = normalizeBotIntent(intent);
        aiExtractedBookingIntent = meaningfulLocalIntent;
      }

      // ── SCOPE CHECK ───────────────────────────────────────────────────────
      const isGreeting = /^(hi|hello|hey|greetings|howdy)(?:\s+there)?[!. ]*$/i.test(promptText.trim());
      if (isGreeting) {
        return res.json({ type: 'greeting', message: aiAssistantMessage || 'Hi! I\'m ShowsNow Concierge. Tell me what you want to watch, like "book 2 action movie tickets in Mumbai tonight".' });
      }

      const isConversational = Boolean(aiAssistantMessage) || /^(are you|who are|what are|can you|help|thanks|thank you)\b/i.test(promptText.trim());
      const freshBookingIntent = hasBookingIntent(promptText) || aiExtractedBookingIntent || Boolean(searchMode) || seatPreferenceUpdated;

      const promptIsInScope = freshBookingIntent || (!aiMarkedOutOfScope && isConversational);
      if (!promptIsInScope) {
        if (aiAssistantMessage) {
          return res.json({ type: 'greeting', message: aiAssistantMessage });
        }
        return res.json({ type: 'out_of_scope', message: BOT_OUT_OF_SCOPE_MESSAGE });
      }
      if (freshBookingIntent) clarificationField = null;

      if (unsupportedActorFilter || ACTOR_FILTER_PATTERN.test(promptText)) {
        return res.json({
          type: 'clarify',
          message: aiAssistantMessage || 'ShowsNow can search by city, movie title, genre, language, cinema, date, time, tickets, and snacks. Actor/cast filtering is not available in the database yet.',
          options: ['Action movies', 'Drama movies', 'Animation movies', 'English movies'],
          context: buildOptionContext(normalizeBotIntent(intent), 'genre', {
            'Action movies': { genre: 'action', current_offset: 0 },
            'Drama movies': { genre: 'drama', current_offset: 0 },
            'Animation movies': { genre: 'animation', current_offset: 0 },
            'English movies': { language: 'english', current_offset: 0 },
          })
        });
      }

      if (isConversational && !freshBookingIntent) {
        return res.json({ type: 'greeting', message: aiAssistantMessage || 'I\'m ShowsNow Concierge. Ask me to find movies, check showtimes, or book tickets in any city.' });
      }

      searchMode = searchMode || inferFallbackQueryIntent(promptText, intent);
    } else {
       // Initial load — reset pagination offset
       intent.current_offset = 0;
    }

    intent = normalizeBotIntent(intent);
    searchMode = searchMode || inferFallbackQueryIntent(promptText, intent);
    const wantsMovieList = searchMode === 'movie_search';
    const wantsCinemaList = searchMode === 'cinema_search';
    const wantsSnackList = searchMode === 'snack_search';

    if (searchMode === 'help') {
      return res.json({
        type: 'greeting',
        message: aiAssistantMessage || 'I can search ShowsNow movies, cinemas, showtimes, genres, languages, dates, times, snacks, seats, and prepare checkout after you confirm a real show.'
      });
    }

    if ((wantsMovieList || wantsCinemaList) && !intent.city && !intent.all_cities) {
      intent.all_cities = true;
    }

    if (wantsSnackList) {
      const snackRes = await query('SELECT name, price FROM snacks ORDER BY price ASC, name ASC LIMIT 20');
      if (snackRes.rows.length === 0) {
        return res.json({ type: 'error', message: 'I do not have snack items listed right now.' });
      }
      const snackLabels = snackRes.rows.map(s => `${s.name} (₹${Number(s.price).toFixed(0)})`);
      return res.json({
        type: 'clarify',
        message: `ShowsNow snacks currently available: ${snackLabels.join(', ')}. You can add a snack during checkout.`,
        options: snackRes.rows.slice(0, 6).map(s => s.name),
        context: buildOptionContext(intent, 'snack', Object.fromEntries(snackRes.rows.map(s => [s.name, { snack: s.name }])))
      });
    }

    if (!intent.city && !intent.all_cities && !wantsCinemaList) {
      const cityOptions = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'];
      const cityValues = {};
      for (const city of cityOptions) {
        cityValues[city] = { city, city_confirmed: true, current_offset: 0 };
      }
      return res.json({
        type: 'clarify',
        message: aiAssistantMessage || 'Which city should I search in?',
        options: cityOptions,
        context: buildOptionContext(intent, 'city', cityValues)
      });
    }

    if (intent.city) {
      const cityRes = await query('SELECT DISTINCT city FROM cinemas WHERE city ILIKE $1 ORDER BY city LIMIT 1', [`%${intent.city}%`]);
      if (cityRes.rows.length === 0) {
        const availableRes = await query('SELECT DISTINCT city FROM cinemas ORDER BY city LIMIT 8');
        const availableCities = availableRes.rows.map(r => r.city);
        const optionValues = {};
        for (const city of availableCities) {
          optionValues[city] = { city, city_confirmed: true, current_offset: 0 };
        }
        return res.json({
          type: 'clarify',
          message: `I do not have ShowsNow cinemas in ${intent.city} right now. Please choose one of the available cities.`,
          options: availableCities,
          context: buildOptionContext({ ...intent, city: undefined }, 'city', optionValues)
        });
      }
      intent.city = cityRes.rows[0].city;
    }

    const timeStr = parseTimeIntent(intent.time_of_day);
    const exactDateStr = parseDateIntent(intent.date);

    if (wantsMovieList && !intent.movie_title) {
      const movieParams = [];
      let movieSql = `
        SELECT
          m.title,
          m.genre,
          m.language,
          MIN(s.show_time) AS next_show,
          MAX(m.vote_average) AS vote_average,
          MAX(m.release_date) AS release_date
        FROM movies m
        JOIN shows s ON m.movie_id = s.movie_id
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN cinemas c ON sc.cinema_id = c.cinema_id
        WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
      `;
      let movieParamIdx = 1;
      if (intent.city) {
        movieSql += ` AND c.city ILIKE $${movieParamIdx}`;
        movieParams.push(`%${intent.city}%`);
        movieParamIdx++;
      }
      if (intent.genre) {
        movieSql += ` AND m.genre ILIKE $${movieParamIdx}`;
        movieParams.push(`%${intent.genre}%`);
        movieParamIdx++;
      }
      if (intent.language) {
        const languageTerms = languageSearchTerms(intent.language);
        const languageClauses = languageTerms.map(term => {
          movieParams.push(`%${term}%`);
          return `m.language ILIKE $${movieParamIdx++}`;
        });
        movieSql += ` AND (${languageClauses.join(' OR ')})`;
      }
      if (exactDateStr) {
        movieSql += ` AND s.show_time::date = $${movieParamIdx}::date`;
        movieParams.push(exactDateStr);
        movieParamIdx++;
      }
      movieSql += ' GROUP BY m.title, m.genre, m.language';
      const movieOrderClauses = [];
      if (timeStr) {
        movieOrderClauses.push(`MIN(ABS(EXTRACT(EPOCH FROM s.show_time::time) - EXTRACT(EPOCH FROM $${movieParamIdx}::time))) ASC`);
        movieParams.push(timeStr);
        movieParamIdx++;
      }
      if (intent.sort_preference === 'latest_release') {
        movieOrderClauses.push('MAX(m.release_date) DESC NULLS LAST');
      } else if (intent.sort_preference === 'best_rating') {
        movieOrderClauses.push('MAX(m.vote_average) DESC NULLS LAST');
      }
      movieOrderClauses.push('MIN(s.show_time) ASC', 'm.title ASC');
      movieSql += ` ORDER BY ${movieOrderClauses.join(', ')} LIMIT 12`;

      const movieRes = await query(movieSql, movieParams);
      const movieTitles = movieRes.rows.map(r => r.title);
      if (movieTitles.length === 0) {
        const cityLabel = intent.city || 'all cities';
        const filterLabel = intent.genre || intent.language || 'movies';
        return res.json({
          type: 'error',
          message: `I could not find ${filterLabel} currently playing in ${cityLabel}. Try another city, genre, language, or time.`
        });
      }
      const optionValues = {};
      for (const title of movieTitles) {
        optionValues[title] = { movie_title: title, movie_confirmed: true, current_offset: 0 };
      }
      const cityLabel = intent.city || 'all cities';
      const filterLabel = intent.genre ? `${intent.genre} movies` : intent.language ? `${intent.language} movies` : 'movies';
      const movieFallback = `Here are ${filterLabel} currently in ${cityLabel}: ${movieTitles.slice(0, 6).join(', ')}. Which one would you like?`;
      const movieReply = await generateBotReply(
        `The user asked for ${filterLabel} in ${cityLabel}. Currently showing: ${movieTitles.join(', ')}. Present these options.`,
        movieFallback
      );
      return res.json({
        type: 'clarify',
        message: movieReply,
        options: movieTitles.slice(0, 6),
        context: buildOptionContext(intent, 'movie_title', optionValues)
      });
    }

    if (wantsCinemaList) {
      if (!intent.city && !intent.all_cities) {
        const cityOptions = ['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Pune'];
        const cityValues = {};
        for (const city of cityOptions) {
          cityValues[city] = { city, city_confirmed: true, current_offset: 0 };
        }
        return res.json({
          type: 'clarify',
          message: 'Which city should I list cinemas for?',
          options: cityOptions,
          context: buildOptionContext(intent, 'city', cityValues)
        });
      }
      const cinemaRes = await query(
        `SELECT name, city
         FROM cinemas
         WHERE ($1::varchar IS NULL OR city ILIKE $1)
         ORDER BY city, name
         LIMIT 12`,
        [intent.city ? `%${intent.city}%` : null]
      );
      const cinemaNames = cinemaRes.rows.map(r => r.name);
      const cinemaLabels = cinemaRes.rows.map(r => intent.city ? r.name : `${r.name} (${r.city})`);
      if (cinemaNames.length === 0) {
        return res.json({
          type: 'error',
          message: `I do not have any cinemas listed in ${intent.city || 'all cities'} right now.`
        });
      }
      const optionValues = {};
      for (const cinema of cinemaNames) {
        optionValues[cinema] = { cinema_name: cinema, cinema_confirmed: true, current_offset: 0 };
      }
      const cityLabel = intent.city || 'all cities';
      const cinemaFallback = `ShowsNow cinemas in ${cityLabel}: ${cinemaLabels.join(', ')}. Pick one to search shows.`;
      const cinemaReply = await generateBotReply(
        `User asked for cinemas in ${cityLabel}. Available: ${cinemaLabels.join(', ')}. Present these options.`,
        cinemaFallback
      );
      return res.json({
        type: 'clarify',
        message: cinemaReply,
        options: cinemaNames.slice(0, 6),
        context: buildOptionContext(intent, 'cinema_name', optionValues)
      });
    }

    const params = [];
    let sql = `
      SELECT
        s.show_id, s.show_time, s.base_price, s.surge_multiplier, s.available_seats,
        m.title, m.poster_url, m.genre, m.release_date, m.vote_average,
        c.name as cinema_name, c.city,
        sc.name as screen_name, sc.screen_id
      FROM shows s
      JOIN movies m ON s.movie_id = m.movie_id
      JOIN screens sc ON s.screen_id = sc.screen_id
      JOIN cinemas c ON sc.cinema_id = c.cinema_id
      WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
    `;

    // ── VALIDATE MOVIE TITLE AGAINST DB ─────────────────────────────────────
    // Prevents hallucinated movie names from silently failing with a confusing
    // "not found" message after the user has already been shown fake showtimes.
    if (intent.movie_title && !intent.movie_confirmed) {
      const movieCheck = await query(
        'SELECT title FROM movies WHERE title ILIKE $1 LIMIT 1',
        [`%${intent.movie_title}%`]
      );
      if (movieCheck.rows.length === 0) {
        // Movie not in our catalog — show what IS playing instead
        const cityFilter = intent.city ? ' AND c.city ILIKE $1' : '';
        const cityParam = intent.city ? [`%${intent.city}%`] : [];
        const playingRes = await query(
          `SELECT DISTINCT m.title FROM movies m
           JOIN shows s ON m.movie_id = s.movie_id
           JOIN screens sc ON s.screen_id = sc.screen_id
           JOIN cinemas c ON sc.cinema_id = c.cinema_id
           WHERE s.show_time >= NOW() ${cityFilter}
           ORDER BY m.title LIMIT 6`,
          cityParam
        );
        const titles = playingRes.rows.map(r => r.title);
        const cityLabel = intent.city || 'our cities';
        if (titles.length === 0) {
          return res.json({ type: 'error', message: `I don't have "${intent.movie_title}" in our catalog right now. No movies are currently scheduled in ${cityLabel}.` });
        }
        const optionValues = {};
        for (const t of titles) optionValues[t] = { movie_title: t, movie_confirmed: true, current_offset: 0 };
        return res.json({
          type: 'clarify',
          message: `"${intent.movie_title}" isn't in our catalog right now${intent.city ? ` in ${intent.city}` : ''}. Currently playing: ${titles.slice(0, 4).join(', ')}. Pick one?`,
          options: titles.slice(0, 6),
          context: buildOptionContext({ ...intent, movie_title: undefined }, 'movie_title', optionValues)
        });
      }
      // Canonicalize to DB title
      intent.movie_title = movieCheck.rows[0].title;
      intent.movie_confirmed = true;
    }

    // ── VALIDATE CINEMA NAME AGAINST DB ─────────────────────────────────────
    if (intent.cinema_name && !intent.cinema_confirmed) {
      const cinemaCheck = await query(
        'SELECT name, city FROM cinemas WHERE name ILIKE $1 LIMIT 1',
        [`%${intent.cinema_name}%`]
      );
      if (cinemaCheck.rows.length === 0) {
        // Cinema doesn't exist — suggest real ones
        const cityFilter = intent.city ? ' WHERE city ILIKE $1' : '';
        const cityParam = intent.city ? [`%${intent.city}%`] : [];
        const realCinemas = await query(
          `SELECT name FROM cinemas${cityFilter} ORDER BY name LIMIT 6`,
          cityParam
        );
        const names = realCinemas.rows.map(r => r.name);
        const optionValues = {};
        for (const n of names) optionValues[n] = { cinema_name: n, cinema_confirmed: true, current_offset: 0 };
        return res.json({
          type: 'clarify',
          message: `I couldn't find "${intent.cinema_name}"${intent.city ? ` in ${intent.city}` : ''}. Here are our cinemas — which do you prefer?`,
          options: names,
          context: buildOptionContext({ ...intent, cinema_name: undefined }, 'cinema_name', optionValues)
        });
      }
      intent.cinema_name = cinemaCheck.rows[0].name;
      intent.cinema_confirmed = true;
    }

    let paramIdx = 1;
    if (intent.selected_show_id) {
      sql += ` AND s.show_id = $${paramIdx}`;
      params.push(intent.selected_show_id);
      paramIdx++;
    }
    if (intent.city) {
      sql += ` AND c.city ILIKE $${paramIdx}`;
      params.push(`%${intent.city}%`);
      paramIdx++;
    }
    if (intent.movie_title) {
      sql += ` AND m.title ILIKE $${paramIdx}`;
      params.push(`%${intent.movie_title}%`);
      paramIdx++;
    }
    if (intent.cinema_name) {
      sql += ` AND c.name ILIKE $${paramIdx}`;
      params.push(`%${intent.cinema_name}%`);
      paramIdx++;
    }
    if (intent.language) {
      const languageTerms = languageSearchTerms(intent.language);
      const languageClauses = languageTerms.map(term => {
        params.push(`%${term}%`);
        return `m.language ILIKE $${paramIdx++}`;
      });
      sql += ` AND (${languageClauses.join(' OR ')})`;
    }
    if (intent.genre) {
      sql += ` AND m.genre ILIKE $${paramIdx}`;
      params.push(`%${intent.genre}%`);
      paramIdx++;
    }
    if (exactDateStr) {
      sql += ` AND s.show_time::date = $${paramIdx}::date`;
      params.push(exactDateStr);
      paramIdx++;
    }

    const orderClauses = [];
    if (timeStr) {
      orderClauses.push(`ABS(EXTRACT(EPOCH FROM s.show_time::time) - EXTRACT(EPOCH FROM $${paramIdx}::time)) ASC`);
      params.push(timeStr);
      paramIdx++;
    }
    if (intent.sort_preference === 'cheapest') {
      orderClauses.push('(s.base_price * s.surge_multiplier) ASC');
    } else if (intent.sort_preference === 'best_rating') {
      orderClauses.push('m.vote_average DESC');
    } else if (intent.sort_preference === 'latest_release') {
      orderClauses.push('m.release_date DESC NULLS LAST');
    }
    orderClauses.push('s.show_time ASC', 'm.vote_average DESC');
    sql += ` ORDER BY ${orderClauses.join(', ')} LIMIT 50`;

    const showRes = await query(sql, params);

    // ── STALE SHOW_ID RECOVERY ───────────────────────────────────────────────
    // If user picked a showtime but the show was since deleted/regenerated,
    // clear selected_show_id and re-run without it so they get fresh options.
    if (showRes.rows.length === 0 && intent.selected_show_id) {
      delete intent.selected_show_id;
      delete intent.time_confirmed;
      delete intent.time_of_day;
      intent.current_offset = 0;
      // Re-run query without the stale show_id
      const freshParams = [];
      let freshSql = `
        SELECT s.show_id, s.show_time, s.base_price, s.surge_multiplier, s.available_seats,
               m.title, m.poster_url, m.genre, m.release_date, m.vote_average,
               c.name as cinema_name, c.city, sc.name as screen_name, sc.screen_id
        FROM shows s
        JOIN movies m ON s.movie_id = m.movie_id
        JOIN screens sc ON s.screen_id = sc.screen_id
        JOIN cinemas c ON sc.cinema_id = c.cinema_id
        WHERE s.show_time >= (NOW() - INTERVAL '30 minutes')
      `;
      let freshIdx = 1;
      if (intent.city) { freshSql += ` AND c.city ILIKE $${freshIdx}`; freshParams.push(`%${intent.city}%`); freshIdx++; }
      if (intent.movie_title) { freshSql += ` AND m.title ILIKE $${freshIdx}`; freshParams.push(`%${intent.movie_title}%`); freshIdx++; }
      if (intent.cinema_name) { freshSql += ` AND c.name ILIKE $${freshIdx}`; freshParams.push(`%${intent.cinema_name}%`); freshIdx++; }
      freshSql += ` ORDER BY s.show_time ASC LIMIT 20`;
      const freshRes = await query(freshSql, freshParams);
      if (freshRes.rows.length > 0) {
        // Show fresh options
        const freshOpts = [];
        const freshOptValues = {};
        const seenFreshLabels = new Map();
        for (const show of freshRes.rows.slice(0, 4)) {
          const baseLabel = formatShowOptionTime(show);
          const count = seenFreshLabels.get(baseLabel) || 0;
          seenFreshLabels.set(baseLabel, count + 1);
          const label = count === 0 ? baseLabel : `${baseLabel} (${show.screen_name})`;
          freshOpts.push(label);
          freshOptValues[label] = { selected_show_id: show.show_id, time_of_day: label, date: showDateLabel(show.show_time), time_confirmed: true, current_offset: 0 };
        }
        if (freshRes.rows.length > 4) {
          freshOptValues['More showtimes'] = { action: 'more', clarification_field: 'time_of_day', current_offset: 4 };
          freshOpts.push('More showtimes');
        }
        const movieName = intent.movie_title || freshRes.rows[0].title;
        const cinemaName = intent.cinema_name || freshRes.rows[0].cinema_name;
        return res.json({
          type: 'clarify',
          message: `That showtime is no longer available. Here are the current showtimes for ${movieName} at ${cinemaName} — which works for you?`,
          options: freshOpts,
          context: buildOptionContext({ ...intent, movie_title: movieName, cinema_name: cinemaName }, 'time_of_day', freshOptValues)
        });
      }
      return res.json({ type: 'error', message: `That showtime is no longer available and I couldn't find other upcoming shows${intent.movie_title ? ` for ${intent.movie_title}` : ''}${intent.city ? ` in ${intent.city}` : ''}. Try a different date or movie.` });
    }

    if (showRes.rows.length === 0) {
      if (clarificationField) {
        return res.json({ 
          type: 'error', 
          message: `I didn't understand "${promptText}". Please select an option from the list or try rephrasing.`,
          context: { ...context } 
        });
      }
      const hint = intent.movie_title || intent.genre || 'movies';
      const cityLabel = intent.city || 'all cities';
      return res.json({ 
        type: 'error', 
        message: `I could not find ${hint} in ${cityLabel}. Try another movie, city, genre, date, or time.` 
      });
    }

    const uniqueMovies = [...new Set(showRes.rows.map(r => r.title))];
    if (!intent.movie_title && uniqueMovies.length > 0) {
      const offset = intent.current_offset || 0;
      const opts = uniqueMovies.slice(offset, offset + 4);
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more movies found. Try searching for a different city or genre.',
          context: { ...intent, current_offset: 0 }
        });
      }
      const optionValues = {};
      for (const title of opts) {
        optionValues[title] = { movie_title: title, movie_confirmed: true, current_offset: 0 };
      }
      if (uniqueMovies.length > offset + 4) {
        optionValues['More movies'] = { action: 'more', clarification_field: 'movie_title', current_offset: offset + 4 };
        opts.push('More movies');
      }
      return res.json({
        type: 'clarify',
        message: aiAssistantMessage || (uniqueMovies.length === 1 ? 'There is only one movie playing matching your search. Please select it to confirm:' : 'I found a few movies playing. Which one would you like?'),
        options: opts,
        context: buildOptionContext(intent, 'movie_title', optionValues)
      });
    }

    const uniqueCinemas = [...new Set(showRes.rows.map(r => r.cinema_name))];
    if (!intent.cinema_name && uniqueCinemas.length > 0) {
      const offset = intent.current_offset || 0;
      const opts = uniqueCinemas.slice(offset, offset + 4);
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more cinemas found.',
          context: { ...intent, current_offset: 0 }
        });
      }
      const optionValues = {};
      for (const cinema of opts) {
        optionValues[cinema] = { cinema_name: cinema, cinema_confirmed: true, current_offset: 0 };
      }
      if (uniqueCinemas.length > offset + 4) {
        optionValues['More cinemas'] = { action: 'more', clarification_field: 'cinema_name', current_offset: offset + 4 };
        opts.push('More cinemas');
      }
      return res.json({
        type: 'clarify',
        message: aiAssistantMessage || (uniqueCinemas.length === 1 ? `I found ${intent.movie_title || uniqueMovies[0]} at only one cinema. Please select it to confirm:` : `I found ${intent.movie_title || uniqueMovies[0]} at multiple cinemas. Which one do you prefer?`),
        options: opts,
        context: buildOptionContext({ ...intent, movie_title: intent.movie_title || uniqueMovies[0] }, 'cinema_name', optionValues)
      });
    }

    if (!intent.selected_show_id && !intent.time_confirmed && showRes.rows.length > 0) {
      const offset = intent.current_offset || 0;
      const showOptions = showRes.rows.slice(offset, offset + 4);
      const opts = [];
      const optionValues = {};
      const seenLabels = new Map();
      for (const show of showOptions) {
        const baseLabel = formatShowOptionTime(show);
        const count = seenLabels.get(baseLabel) || 0;
        seenLabels.set(baseLabel, count + 1);
        const label = count === 0 ? baseLabel : `${baseLabel} (${show.screen_name})`;
        opts.push(label);
        optionValues[label] = {
          selected_show_id: show.show_id,
          time_of_day: label,
          date: showDateLabel(show.show_time),
          time_confirmed: true,
          current_offset: 0
        };
      }
      if (showRes.rows.length > offset + 4) {
        optionValues['More showtimes'] = { action: 'more', clarification_field: 'time_of_day', current_offset: offset + 4 };
        opts.push('More showtimes');
      }
      if (opts.length === 0) {
        return res.json({
          type: 'error',
          message: 'No more showtimes found.',
          context: { ...intent, current_offset: 0 }
        });
      }
      const movieName = intent.movie_title || uniqueMovies[0];
      const cinemaName = intent.cinema_name || uniqueCinemas[0];
      const showtimeFallback = showRes.rows.length === 1
        ? `There is only one showtime for ${movieName} at ${cinemaName}. Select it to confirm.`
        : `${movieName} is playing at ${cinemaName}. Here are the available showtimes — which works for you?`;
      const showtimeReply = await generateBotReply(
        `Movie: ${movieName}, Cinema: ${cinemaName}. Available showtimes: ${opts.filter(o => o !== 'More showtimes').join(', ')}. Tell the user which times are available and ask them to pick one.`,
        showtimeFallback
      );
      return res.json({
        type: 'clarify',
        message: showtimeReply,
        options: opts,
        context: buildOptionContext({
          ...intent,
          movie_title: movieName,
          cinema_name: cinemaName
        }, 'time_of_day', optionValues)
      });
    }

    if (!intent.quantity) {
      const quantityValues = {
        '1': { quantity: 1, quantity_confirmed: true },
        '2': { quantity: 2, quantity_confirmed: true },
        '3': { quantity: 3, quantity_confirmed: true },
        '4': { quantity: 4, quantity_confirmed: true },
      };
      return res.json({
        type: 'clarify',
        message: 'How many tickets do you need? (Max 10)',
        options: ['1', '2', '3', '4'],
        context: buildOptionContext(intent, 'quantity', quantityValues)
      });
    }
    intent.quantity = parseInt(intent.quantity, 10);
    if (!Number.isInteger(intent.quantity) || intent.quantity < 1) {
      return res.json({ type: 'error', message: 'Please tell me a valid ticket count.' });
    }
    if (intent.quantity > 10) {
      return res.json({ type: 'error', message: 'ShowsNow allows a maximum of 10 tickets in one booking. Please ask for 10 or fewer.' });
    }

    const bestShow = intent.selected_show_id
      ? showRes.rows.find(r => r.show_id === intent.selected_show_id) || showRes.rows[0]
      : showRes.rows[0];
    if (bestShow.available_seats < intent.quantity) {
      return res.json({
        type: 'waitlist',
        message: `"${bestShow.title}" at ${bestShow.cinema_name} only has ${bestShow.available_seats} seats left, but you asked for ${intent.quantity}. Want me to add you to the waitlist?`,
        waitlistData: { show_id: bestShow.show_id, requested_seats: intent.quantity }
      });
    }

    await query('SELECT expire_seat_holds()');
    const seatRes = await query(`
      SELECT seat_id, row_no, seat_no, seat_type, price_multiplier
      FROM seats
      WHERE screen_id = $1
        AND NOT EXISTS (
          SELECT 1
          FROM tickets t
          JOIN bookings b ON t.booking_id = b.booking_id
          WHERE t.seat_id = seats.seat_id
            AND t.show_id = $2
            AND b.status = 'Confirmed'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM seat_holds h
          WHERE h.seat_id = seats.seat_id
            AND h.show_id = $2
            AND h.status = 'Active'
            AND h.expires_at > NOW()
        )
      ORDER BY
        CASE WHEN seat_type = 'VIP' THEN 1 WHEN seat_type = 'Premium' THEN 2 ELSE 3 END ASC,
        row_no ASC, seat_no ASC
    `, [bestShow.screen_id, bestShow.show_id]);

    if (seatRes.rows.length < intent.quantity) {
      return res.json({ type: 'error', message: 'Not enough seats are available right now.' });
    }

    const selectedSeats = chooseSeatsByPreference(seatRes.rows, intent.quantity, intent.seat_preference || {});
    const basePrice = parseFloat(bestShow.base_price);
    const surgeMultiplier = parseFloat(bestShow.surge_multiplier) || 1.0;
    const totalTicketPrice = selectedSeats.reduce((sum, s) => sum + (basePrice * parseFloat(s.price_multiplier) * surgeMultiplier), 0);

    let preCartSnacks = {};
    if (intent.snack) {
      const snRes = await query('SELECT snack_id as id FROM snacks WHERE name ILIKE $1 LIMIT 1', [`%${intent.snack}%`]);
      if (snRes.rows.length > 0) preCartSnacks[snRes.rows[0].id] = 1;
    }

    const datePrefix = showDateLabel(bestShow.show_time);
    const timeString = formatTimeInAppZone(bestShow.show_time);

    const checkoutPayload = {
      show_id: bestShow.show_id,
      preSelectedSeatIds: selectedSeats.map(s => s.seat_id),
      selectedSeats,
      showInfo: bestShow,
      totalTicketPrice,
      preCartSnacks
    };
    const selectedSeatLabels = selectedSeats.map(s => `${s.row_no}${s.seat_no}`).join(', ');
    const confirmOptions = [BOT_CHECKOUT_CONFIRM_LABEL, 'Change seats', 'Change movie', 'Change cinema', 'Change time', 'Change tickets'];
    const confirmValues = {
      [BOT_CHECKOUT_CONFIRM_LABEL]: { action: 'checkout', checkoutPayload },
      'Change seats': { action: 'change_seats' },
      'Change movie': { action: 'change_movie' },
      'Change cinema': { action: 'change_cinema' },
      'Change time': { action: 'change_time' },
      'Change tickets': { action: 'change_quantity' },
    };

    // IMPORTANT: Do NOT use generateBotReply here. Checkout confirmation contains financial
    // data (price, seat labels, quantity) that must be 100% deterministic. Gemini can
    // hallucinate numbers when rephrasing, which is unacceptable for payment confirmation.
    const checkoutMessage = `${intent.quantity} ticket${intent.quantity === 1 ? '' : 's'} for "${bestShow.title}" at ${bestShow.cinema_name}, ${datePrefix} at ${timeString}. Seats: ${selectedSeatLabels}. Total: ₹${totalTicketPrice.toFixed(0)}. Confirm or change?`;

    res.json({
      type: 'confirm_checkout',
      message: checkoutMessage,
      options: confirmOptions,
      context: buildOptionContext({ ...intent, checkoutPayload }, 'checkout_confirmation', confirmValues)
    });
  } catch (err) {
    console.error('Autonomous Agent Error:', err);
    res.status(500).json({ error: 'Agent failed to process request' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// AUTO SHOW GENERATION
// Runs on startup and nightly at midnight. Inserts shows for every movie/screen
// combination for the next 5 days, skipping timeslots that have already passed.
// Uses ON CONFLICT DO NOTHING so re-running is always safe.
// ─────────────────────────────────────────────────────────────────────────────
async function autoGenerateShows() {
  console.log('[Shows] Auto-generating fresh shows...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // First: clean up shows that are more than 1 hour in the past (they're irrelevant)
    const deleted = await client.query(
      "DELETE FROM shows WHERE show_time < NOW() - INTERVAL '1 hour' AND show_id NOT IN (SELECT DISTINCT show_id FROM tickets)"
    );
    if (deleted.rowCount > 0) console.log(`[Shows] Removed ${deleted.rowCount} stale past shows.`);

    // Generate future shows for all movies across all screens.
    // 6 cinema-standard slot times (minutes from midnight IST):
    //   600=10:00  750=12:30  900=15:00  1050=17:30  1200=20:00  1350=22:30
    // Each screen gets exactly 2 of the 6 slots (chosen by screen-id hash).
    const result = await client.query(`
      INSERT INTO shows (movie_id, screen_id, show_time, base_price, available_seats)
      SELECT DISTINCT
        m.movie_id,
        s.screen_id,
        (DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
          + (d.day_offset || ' days')::INTERVAL
          + (slot.slot_min || ' minutes')::INTERVAL
        ) AS show_time,
        (200 + MOD(ABS(hashtext(m.movie_id::text)), 200))::numeric AS base_price,
        s.total_seats
      FROM movies m
      CROSS JOIN screens s
      CROSS JOIN generate_series(0, 4) AS d(day_offset)
      CROSS JOIN UNNEST(ARRAY[
        CASE MOD(ABS(hashtext(s.screen_id::text)), 6)
          WHEN 0 THEN 600  WHEN 1 THEN 750  WHEN 2 THEN 900
          WHEN 3 THEN 1050 WHEN 4 THEN 1200 ELSE 1350
        END,
        CASE MOD(ABS(hashtext(s.screen_id::text)), 6)
          WHEN 0 THEN 1200 WHEN 1 THEN 1350 WHEN 2 THEN 600
          WHEN 3 THEN 750  WHEN 4 THEN 900  ELSE 1050
        END
      ]) AS slot(slot_min)
      WHERE
        (m.release_date IS NULL OR m.release_date <= (CURRENT_DATE + (d.day_offset || ' days')::INTERVAL)::date)
        AND (
          DATE_TRUNC('day', NOW() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
          + (d.day_offset || ' days')::INTERVAL
          + (slot.slot_min || ' minutes')::INTERVAL
        ) > NOW()
      ON CONFLICT (screen_id, show_time) DO NOTHING
    `);
    await client.query('COMMIT');
    console.log(`[Shows] Done. ${result.rowCount} new show slots inserted.`);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('[Shows] Error during auto-generation:', err.message, err.stack?.split('\n')[1]);
  } finally {
    client.release();
  }
}

// Manual refresh endpoint (admin or server health check use)
app.post('/api/shows/refresh', async (req, res) => {
  try {
    await autoGenerateShows();
    res.json({ success: true, message: 'Shows refreshed.' });
  } catch (err) {
    res.status(500).json({ error: 'Show refresh failed.' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// DELETE waitlist entry — user can leave a waitlist they joined
// ─────────────────────────────────────────────────────────────────────────────
app.delete('/api/waitlist/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { user_id } = req.user;
  try {
    const result = await query(
      'DELETE FROM waitlist WHERE waitlist_id = $1 AND user_id = $2 AND status = $3 RETURNING waitlist_id',
      [id, user_id, 'Waiting']
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Waitlist entry not found or already processed.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('Waitlist delete error:', err);
    res.status(500).json({ error: 'Failed to remove from waitlist.' });
  }
});

app.listen(PORT, async () => {
  console.log(`Server running on port ${PORT}`);

  // Generate shows immediately on startup — no stale data when app first opens
  await autoGenerateShows();

  // Nightly reseed: pulls fresh movies from TMDB and regenerates shows
  cron.schedule('0 0 * * *', async () => {
    console.log('[CRON] Running nightly TMDB seed + show generation...');
    exec('node seedData.js', { cwd: __dirname }, (error, stdout, stderr) => {
      if (error) { console.error(`[CRON] seedData error: ${error.message}`); return; }
      if (stderr) console.error(`[CRON] seedData stderr: ${stderr}`);
      console.log(`[CRON] seedData done:\n${stdout}`);
    });
    // Also regenerate shows for any new movies that seedData added
    setTimeout(() => autoGenerateShows(), 60_000);
  });

  // Hourly cleanup of shows that have now passed — keeps the DB lean
  cron.schedule('5 * * * *', () => {
    pool.query("DELETE FROM shows WHERE show_time < NOW() - INTERVAL '1 hour' AND show_id NOT IN (SELECT DISTINCT show_id FROM tickets)")
      .then(r => { if (r.rowCount > 0) console.log(`[CRON] Cleaned ${r.rowCount} past shows.`); })
      .catch(e => console.error('[CRON] Show cleanup error:', e.message));
  });

  console.log('Cron schedulers initialized: midnight TMDB seed + hourly cleanup');
});

