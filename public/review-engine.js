/* Atlas review v2 — transparent scheduling heuristic, not FSRS or a validated memory model.
 * Stability is measured in days; timestamps are epoch milliseconds. No daily streaks.
 * First learning/relearning check: 10 minutes. Short practice never grows stability.
 * Public API is pure: input records are never mutated. Treat `memory` as one sync field.
 */
(function (root) {
  'use strict';
  const DAY = 86400000, RETRY = 600000, MIN_SPACING = 43200000;
  const MAX_STABILITY = 3650, MAX_HISTORY = 40, MAX_TIMESTAMP = 8640000000000000;
  const RATINGS = ['again', 'hard', 'good', 'easy'];
  const PHASES = ['learning', 'review', 'relearning'];
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const finite = (n, fallback) => Number.isFinite(Number(n)) ? Number(n) : fallback;
  const clock = n => clamp(finite(n, Date.now()), 0, MAX_TIMESTAMP);
  const session = s => String(s || 'anonymous').slice(0, 100);

  function normalize(value) {
    if (!value || typeof value !== 'object' || !Number.isFinite(value.lastReviewAt) || !Number.isFinite(value.dueAt)) return null;
    if (value.lastReviewAt < 0 || value.dueAt < 0 || value.lastReviewAt > MAX_TIMESTAMP || value.dueAt > MAX_TIMESTAMP) return null;
    const m = {
      version: 2,
      stability: clamp(finite(value.stability, 0.8), 0.05, MAX_STABILITY),
      difficulty: clamp(finite(value.difficulty, 5), 1, 10),
      lastReviewAt: Math.max(0, value.lastReviewAt),
      dueAt: Math.max(0, value.dueAt),
      phase: PHASES.includes(value.phase) ? value.phase : 'learning',
      reps: Math.floor(clamp(finite(value.reps, 0), 0, 1000000)),
      lapses: Math.floor(clamp(finite(value.lapses, 0), 0, 1000000)),
      history: [],
      sessionId: session(value.sessionId)
    };
    m.history = (Array.isArray(value.history) ? value.history : []).slice(-MAX_HISTORY)
      .filter(e => e && Number.isFinite(e.at) && e.at >= 0 && e.at <= MAX_TIMESTAMP && RATINGS.includes(e.rating))
      .map(e => ({
        at: Math.max(0, e.at), rating: e.rating,
        quizCorrect: typeof e.quizCorrect === 'boolean' ? e.quizCorrect : null,
        elapsedDays: clamp(finite(e.elapsedDays, 0), 0, 365000),
        stability: clamp(finite(e.stability, m.stability), 0.05, MAX_STABILITY),
        difficulty: clamp(finite(e.difficulty, m.difficulty), 1, 10),
        intervalDays: clamp(finite(e.intervalDays, 0), 0, MAX_STABILITY),
        phase: PHASES.includes(e.phase) ? e.phase : 'learning',
        sessionId: session(e.sessionId)
      }));
    return m;
  }

  function recall(value, nowMs) {
    const m = normalize(value);
    if (!m) return null;
    const elapsedDays = Math.max(0, clock(nowMs) - m.lastReviewAt) / DAY;
    // Convenient ranking curve: 90% at one stability unit. Not a measured probability.
    return clamp(Math.pow(0.9, elapsedDays / m.stability), 0.001, 1);
  }

  function rate(value, rating, nowMs, sessionId, quizCorrect) {
    if (!RATINGS.includes(rating)) throw new TypeError('Unknown review rating');
    const now = clock(nowMs), old = normalize(value), sid = session(sessionId);
    const elapsedMs = old ? Math.max(0, now - old.lastReviewAt) : 0;
    // A grade is an event, not a button-press counter. Double clicks and immediate
    // re-grading cannot generate repetitions, lapses, or longer intervals.
    if (old && old.reps > 0 && (now <= old.lastReviewAt || (old.sessionId === sid && elapsedMs < RETRY))) return old;
    const effective = quizCorrect === false ? 'again' : rating;
    const established = !!old && old.reps > 0;
    let stability = established ? old.stability : ({ again: 0.25, hard: 0.5, good: 0.8, easy: 1.1 }[effective]);
    let difficulty = established ? old.difficulty : 5;
    let lapses = old ? old.lapses : 0;
    let phase = 'learning', intervalDays = RETRY / DAY;
    const elapsedDays = elapsedMs / DAY;
    const spaced = established && elapsedMs >= Math.max(MIN_SPACING, old.stability * DAY * 0.2);
    if (effective === 'again') {
      if (established) stability = Math.max(0.05, old.stability * 0.45 / (1 + 0.04 * Math.min(old.lapses, 10)));
      difficulty = Math.min(10, difficulty + 0.8);
      lapses = Math.min(1000000, lapses + 1);
      phase = established ? 'relearning' : 'learning';
    } else if (established) {
      if (spaced) {
        const gradeGain = { hard: 0.2, good: 0.8, easy: 1.2 }[effective];
        const spacingRatio = Math.min(4, elapsedDays / old.stability);
        const evidence = quizCorrect === true ? 1.08 : 1;
        const gain = gradeGain * ((11 - old.difficulty) / 10) * (0.25 + spacingRatio)
          * evidence / (1 + 0.15 * old.lapses);
        stability = clamp(old.stability * (1 + gain), 0.05, MAX_STABILITY);
        difficulty = clamp(difficulty + ({ hard: 0.25, good: -0.1, easy: -0.35 }[effective]), 1, 10);
      }
      // A successful 10-minute check can graduate learning, but it does not
      // demonstrate durable retention and therefore never increases stability.
      phase = elapsedMs >= RETRY ? 'review' : old.phase;
      if (phase === 'review') intervalDays = Math.min(MAX_STABILITY, stability * ({ hard: 0.7, good: 1, easy: 1.2 }[effective]));
    }
    let dueAt = Math.min(MAX_TIMESTAMP, now + intervalDays * DAY);
    // Revisiting an already scheduled card early must not postpone its due date.
    if (old && !spaced && old.phase === 'review' && effective !== 'again' && old.dueAt > now) {
      dueAt = Math.min(dueAt, old.dueAt);
      intervalDays = Math.max(0, dueAt - now) / DAY;
    }
    const next = {
      version: 2, stability, difficulty, lastReviewAt: now, dueAt, phase,
      reps: Math.min(1000000, (old ? old.reps : 0) + 1), lapses,
      history: old ? old.history.slice() : [], sessionId: sid
    };
    next.history.push({ at: now, rating: effective, quizCorrect: typeof quizCorrect === 'boolean' ? quizCorrect : null,
      elapsedDays: Math.min(365000, elapsedDays), stability, difficulty, intervalDays, phase, sessionId: sid });
    next.history = next.history.slice(-MAX_HISTORY);
    return next;
  }

  function legacyTime(value) {
    if (Number.isFinite(value)) return Math.max(0, value);
    if (typeof value !== 'string') return null;
    const parsed = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + 'T00:00:00' : value);
    return Number.isFinite(parsed) ? Math.max(0, parsed) : null;
  }

  function migrateLegacy(progress, nowMs) {
    const p = progress && typeof progress === 'object' ? progress : {};
    const existing = normalize(p.memory);
    if (existing) return { ...p, memory: existing };
    const reviewed = legacyTime(p.lastReviewed), seen = legacyTime(p.seenAt), due = legacyTime(p.reviewAt);
    if (reviewed === null && seen === null && due === null && !p.mastered) return { ...p };
    const now = clock(nowMs), last = reviewed ?? seen ?? now;
    // Preserve the legacy calendar due date rather than rescheduling on migration.
    // Do not fabricate a review history or infer durable mastery from an old flag.
    const stability = clamp(finite(p.interval, 0.8) || 0.8, 0.05, MAX_STABILITY);
    return { ...p, memory: {
      version: 2, stability, difficulty: 5, lastReviewAt: Math.min(last, now),
      dueAt: due ?? now, phase: reviewed !== null || due !== null ? 'review' : 'learning',
      reps: reviewed !== null || due !== null ? 1 : 0, lapses: 0, history: [], sessionId: 'legacy'
    } };
  }

  function isDue(value, nowMs) {
    const m = normalize(value);
    return !!m && m.dueAt <= clock(nowMs);
  }

  function priority(value, nowMs) {
    const m = normalize(value);
    if (!m) return -Infinity;
    const now = clock(nowMs), risk = 1 - recall(m, now);
    const lateRatio = Math.max(0, now - m.dueAt) / (DAY * m.stability);
    return (isDue(m, now) ? 1000 : 0) + risk * 1000 + Math.log1p(lateRatio) * 100
      + (m.phase === 'relearning' ? 150 : m.phase === 'learning' ? 80 : 0)
      + Math.min(m.lapses, 10) * 5;
  }

  function reviewMinutes(card) {
    // A recall check is shorter than reading the full card. Budget is approximate.
    return Math.max(1, Math.min(3, Math.round(finite(card.reviewMinutes, finite(card.minutes, 10) / 5))));
  }
  function recordFor(progress, id) {
    return typeof progress === 'function' ? progress(id) : (progress && (progress.cards || progress)[id]) || {};
  }
  function queue(cards, progress, nowMs, options) {
    const now = clock(nowMs), opts = options || {};
    const limit = Math.floor(clamp(finite(opts.limit, 10), 0, 20));
    const budget = opts.minutes == null ? Infinity : clamp(finite(opts.minutes, 15), 0, 30);
    const candidates = (Array.isArray(cards) ? cards : []).map(card => {
      const m = migrateLegacy(recordFor(progress, card.id), now).memory;
      return { card, m, cost: reviewMinutes(card), score: priority(m, now) };
    }).filter(x => x.m && (opts.practice === true || isDue(x.m, now)))
      .sort((a, b) => b.score - a.score || a.m.dueAt - b.m.dueAt || a.card.id.localeCompare(b.card.id));
    const result = [], seen = new Set(); let used = 0;
    for (const x of candidates) {
      if (result.length >= limit) break;
      if (seen.has(x.card.id) || used + x.cost > budget) continue;
      result.push(x.card); seen.add(x.card.id); used += x.cost;
    }
    return result;
  }

  function stats(cards, progress, nowMs) {
    const now = clock(nowMs);
    const all = (Array.isArray(cards) ? cards : []).map(card => ({ card, m: migrateLegacy(recordFor(progress, card.id), now).memory }));
    const learned = all.filter(x => x.m), pending = learned.filter(x => isDue(x.m, now));
    const future = learned.map(x => x.m.dueAt).filter(x => x > now);
    return {
      learned: learned.length, unseen: all.length - learned.length, due: pending.length,
      relearning: learned.filter(x => x.m.phase === 'relearning').length,
      overdue: pending.filter(x => now - x.m.dueAt >= DAY).length,
      estimatedMinutes: pending.reduce((n, x) => n + reviewMinutes(x.card), 0),
      averageRecall: learned.length ? learned.reduce((n, x) => n + recall(x.m, now), 0) / learned.length : null,
      stable: learned.filter(x => x.m.phase === 'review' && x.m.stability >= 7 && recall(x.m, now) >= 0.8).length,
      nextDueAt: future.length ? Math.min(...future) : null
    };
  }

  root.AtlasReview = Object.freeze({ version: 2, rate, priority, isDue, queue, stats,
    recall, normalize, migrateLegacy, reviewMinutes, DAY, RETRY,
    modelLabel: 'Transparent heuristic; not validated FSRS or measured recall probabilities.' });
})(typeof globalThis !== 'undefined' ? globalThis : window);
