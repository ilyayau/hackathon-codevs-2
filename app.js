// ========= TOKENIZER / MARKOV =========

function tokenize(text) {
  const regex = /\w+|[^\w\s]/gu;
  const tokens = [];
  let m;
  while ((m = regex.exec(text)) !== null) tokens.push(m[0]);
  return tokens;
}

function detokenize(tokens) {
  let result = "";
  for (const t of tokens) {
    if (/^[\.\,\!\?\:\;]$/.test(t)) result += t;
    else if (result === "") result = t;
    else result += " " + t;
  }
  return result;
}

function buildMarkov(posts, order = 2) {
  const chain = new Map();
  for (const post of posts) {
    const tokens = tokenize(post);
    if (tokens.length <= order) continue;
    for (let i = 0; i <= tokens.length - order - 1; i++) {
      const key = tokens.slice(i, i + order).join(" ");
      const next = tokens[i + order];
      const arr = chain.get(key);
      if (arr) arr.push(next);
      else chain.set(key, [next]);
    }
  }
  return chain;
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFromMarkov(chain, order, maxTokens, topicWords) {
  const keys = Array.from(chain.keys());
  if (!keys.length) return "";
  let startKey = null;
  const lwTopic = topicWords.map((t) => t.toLowerCase());
  for (const key of keys) {
    const parts = key.split(" ");
    if (parts.some((p) => lwTopic.includes(p.toLowerCase()))) {
      startKey = key;
      break;
    }
  }
  if (!startKey) startKey = randomChoice(keys);
  let tokens = startKey.split(" ");
  while (tokens.length < maxTokens) {
    const key = tokens.slice(tokens.length - order, tokens.length).join(" ");
    const options = chain.get(key);
    if (!options || !options.length) break;
    const next = randomChoice(options);
    tokens.push(next);
    if (/[\.!\?]/.test(next) && tokens.length > Math.max(80, maxTokens * 0.8)) break;
  }
  return detokenize(tokens);
}

// ========= LANGUAGE DETECTION =========

function detectLanguage(posts) {
  const allText = posts.join(" ").toLowerCase();
  const cyrillicCount = (allText.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (allText.match(/[a-zA-Z]/g) || []).length;
  const kazakhSpec = (allText.match(/[әіңғүұқөһ]/g) || []).length;

  if (cyrillicCount + latinCount + kazakhSpec === 0) return "en";

  if (cyrillicCount > latinCount) {
    if (kazakhSpec > cyrillicCount * 0.05) return "kk";
    return "ru";
  }
  return "en";
}

// ========= TONALITY / STYLE =========

function analyzeTonality(posts, lang) {
  const allText = posts.join(" ").toLowerCase();

  const dict = {
    en: {
      formal: ["opportunity", "regarding", "therefore", "furthermore", "professional", "strategic", "commitment", "framework", "insights"],
      informal: ["awesome", "cool", "crazy", "vibes", "love", "fun", "wow", "super"],
      positive: ["amazing", "incredible", "beautiful", "wonderful", "excellent", "fantastic", "grateful", "exciting"]
    },
    ru: {
      formal: ["коллеги", "партнеры", "проект", "развитие", "стратегия", "возможность", "результаты", "команда"],
      informal: ["круто", "офигенно", "вау", "кайф", "жесть", "душно", "лайкнул", "зашло"],
      positive: ["классно", "здорово", "супер", "рад", "рада", "радостно", "вдохновляет", "мотивирует"]
    },
    kk: {
      formal: ["әріптестер", "жоба", "даму", "стратегия", "мүмкіндік", "нәтиже", "қауымдастық"],
      informal: ["керемет", "қатты ұнады", "бомба", "запуск", "крашнуло", "өшіп кетті"],
      positive: ["керемет", "тамаша", "қуаныштымын", "мотивация", "вдохновило"]
    }
  };

  const dictLang = dict[lang] || dict.en;

  let formalScore = 0;
  let informalScore = 0;
  let positiveScore = 0;

  for (const w of dictLang.formal) {
    formalScore += (allText.match(new RegExp("\\b" + w + "\\b", "gi")) || []).length;
  }
  for (const w of dictLang.informal) {
    informalScore += (allText.match(new RegExp("\\b" + w + "\\b", "gi")) || []).length;
  }
  for (const w of dictLang.positive) {
    positiveScore += (allText.match(new RegExp("\\b" + w + "\\b", "gi")) || []).length;
  }

  const emojiCount = (posts.join(" ").match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  informalScore += emojiCount * 1.5;

  return {
    formality: formalScore >= informalScore ? "formal" : "informal",
    formalityRatio: formalScore / Math.max(1, formalScore + informalScore),
    positivity: positiveScore > posts.length * 0.6 ? "positive" : "neutral",
    positivityScore: positiveScore / Math.max(1, posts.length)
  };
}

function extractSentencePatterns(posts) {
  const patterns = {
    avgSentenceLength: 0,
    shortSentences: 0,
    longSentences: 0,
    questions: 0,
    exclamations: 0,
    startsWithI: 0,
    totalSentences: 0
  };

  for (const post of posts) {
    const sentences = post.split(/[.!?…]+/).filter(s => s.trim().length > 0);
    patterns.totalSentences += sentences.length;

    for (const sent of sentences) {
      const words = sent.trim().split(/\s+/);
      patterns.avgSentenceLength += words.length;
      if (words.length <= 8) patterns.shortSentences++;
      else if (words.length >= 20) patterns.longSentences++;
      const first = (words[0] || "").toLowerCase();
      if (first === "i" || first === "я" || first === "мен") patterns.startsWithI++;
    }

    patterns.questions += (post.match(/\?/g) || []).length;
    patterns.exclamations += (post.match(/!/g) || []).length;
  }

  patterns.avgSentenceLength = patterns.avgSentenceLength / Math.max(1, patterns.totalSentences);
  return patterns;
}

function extractOpeningClosingPhrases(posts) {
  const openings = [];
  const closings = [];
  for (const post of posts) {
    const sentences = post.split(/[.!?…]+/).filter(s => s.trim().length > 0);
    if (!sentences.length) continue;
    const o = sentences[0].trim();
    if (o.length > 5 && o.length < 160) openings.push(o);
    if (sentences.length > 1) {
      const c = sentences[sentences.length - 1].trim();
      if (c.length > 5 && c.length < 160) closings.push(c);
    }
  }
  return { openings, closings };
}

function extractCharacteristicPhrases(posts, lang) {
  const allText = posts.join(" ");
  const words = allText.split(/\s+/);
  const phraseMap = new Map();

  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ").toLowerCase();
      if (!/^[\p{L}\s]+$/u.test(phrase)) continue;
      phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
    }
  }

  const result = [];
  for (const [phrase, count] of phraseMap.entries()) {
    if (count >= 2) result.push({ phrase, count });
  }
  result.sort((a, b) => b.count - a.count);
  return result.slice(0, 20).map(p => p.phrase);
}

function humanizeText(text, preserveStyle) {
  let h = text;
  h = h.replace(/—/g, ",");
  h = h.replace(/\*\*/g, "");
  h = h.replace(/\*/g, "");
  h = h.replace(/#{1,6}\s/g, "");
  if (!preserveStyle) {
    const fillers = ["very", "really", "literally", "actually", "basically", "просто", "реально", "типа"];
    for (const w of fillers) {
      const re = new RegExp("\\b" + w + "\\s+", "gi");
      h = h.replace(re, "");
    }
  }
  h = h.replace(/\s+/g, " ");
  h = h.replace(/\s+\./g, ".");
  h = h.replace(/\s+,/g, ",");
  return h.trim();
}

function cutToFullSentence(text) {
  const t = text.trim();
  if (!t) return t;
  const lastDot = t.lastIndexOf(".");
  const lastExc = t.lastIndexOf("!");
  const lastQ = t.lastIndexOf("?");
  const last = Math.max(lastDot, lastExc, lastQ);
  if (last === -1) return t;
  return t.slice(0, last + 1).trim();
}

function isGibberish(text) {
  const tokens = tokenize(text);
  if (tokens.length < 20) return false;
  const single = tokens.filter((t) => /^\p{L}$/u.test(t)).length;
  const longWords = tokens.filter((t) => /^\p{L}{4,}$/u.test(t)).length;
  const ratioSingle = single / tokens.length;
  const ratioLong = longWords / tokens.length;
  return ratioSingle > 0.45 && ratioLong < 0.25;
}

// ========= SIMPLE VECTORS & RAG =========

function normalizeWordForVec(token) {
  let w = token.toLowerCase();
  w = w.replace(/[^a-zа-яәіңғүұқөһ0-9]+/gi, "");
  if (w.length < 2) return "";
  return w;
}

function textToVectorWithVocab(text, vocab) {
  const vec = new Float32Array(vocab.size);
  const tokens = tokenize(text);
  for (const tok of tokens) {
    const w = normalizeWordForVec(tok);
    if (!w) continue;
    const idx = vocab.get(w);
    if (idx !== undefined) vec[idx] += 1;
  }
  return vec;
}

function cosineSim(a, b) {
  const len = a.length;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    const x = a[i], y = b[i];
    dot += x * y;
    na += x * x;
    nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function buildRAGIndex(samplePosts, lang) {
  const sentences = [];
  for (const post of samplePosts) {
    const parts = post.split(/[.!?…]+/);
    for (let s of parts) {
      s = s.trim();
      if (s.length >= 20) sentences.push(s);
    }
  }
  if (!sentences.length) return { sentences: [], vectors: [], vocab: new Map(), lang };

  const vocab = new Map();
  let nextId = 0;
  for (const s of sentences) {
    const tokens = tokenize(s);
    for (const tok of tokens) {
      const w = normalizeWordForVec(tok);
      if (!w) continue;
      if (!vocab.has(w)) {
        vocab.set(w, nextId++);
      }
    }
  }

  const vectors = sentences.map(s => textToVectorWithVocab(s, vocab));
  return { sentences, vectors, vocab, lang };
}

function retrieveRAGContext(topic, ragIndex, maxK) {
  if (!ragIndex || !ragIndex.sentences.length) return [];
  const qVec = textToVectorWithVocab(topic, ragIndex.vocab);
  const scores = [];
  for (let i = 0; i < ragIndex.sentences.length; i++) {
    const sim = cosineSim(qVec, ragIndex.vectors[i]);
    scores.push({ i, sim });
  }
  scores.sort((a, b) => b.sim - a.sim);
  const res = [];
  const k = maxK || 3;
  for (const { i, sim } of scores) {
    if (res.length >= k) break;
    if (sim <= 0.1) break;
    res.push(ragIndex.sentences[i]);
  }
  return res;
}

// ========= PARSING INPUT =========

function parseInput(input) {
  const audienceMatch = input.match(/Audience:\s*([^,]+)/i);
  const audience = audienceMatch ? audienceMatch[1].trim() : "General";

  let content = input.replace(/Audience:\s*[^,]+/i, "").trim();
  content = content.replace(/,\s*$/, "").trim();

  const locationMatch = content.match(/\b([A-ZА-ЯӘІҢҒҮҰҚӨҺ][\w\-]+(?:\s+[A-ZА-ЯӘІҢҒҮҰҚӨҺ][\w\-]+)*)\b/);
  const location = locationMatch ? locationMatch[1] : undefined;

  const activities = [];
  const people = [];

  const peoplePattern = /(met|met with|saw|caught up with|hung out with|spent time with|қателесіп|кездестім|встретил[аи]?|познакомился с)\s+([^,]+?)(?=,|$)/gi;
  let pm;
  while ((pm = peoplePattern.exec(content)) !== null) {
    let names = pm[2].replace(/\s+and\s+/gi, ",").split(",").map(x => x.trim()).filter(Boolean);
    people.push(...names);
  }

  const activityPattern = /(explored|visited|saw|discovered|experienced|enjoyed|walked|attended|походил[аи]?|гулял[аи]?|сходил[аи]?|бардым|қарадым|зерттедім)\s+([^,]+?)(?=,|$)/gi;
  let am;
  while ((am = activityPattern.exec(content)) !== null) {
    activities.push(am[0].trim());
  }

  if (!activities.length) {
    const chunks = content.split(",").map(c => c.trim()).filter(c => c.length > 0);
    activities.push(...chunks.slice(0, 4));
  }

  return { content, location, activities, people, audience };
}

// ========= HASHTAGS =========

function generateHashtags(parsed, socialNetwork, authorStyle, lang) {
  const hashtags = [];

  const add = (tag) => {
    if (!tag) return;
    if (!tag.startsWith("#")) tag = "#" + tag;
    hashtags.push(tag.toLowerCase());
  };

  if (parsed.location) {
    const locSlug = parsed.location.toLowerCase().replace(/\s+/g, "");
    add(locSlug);
    if (socialNetwork === "instagram") add(locSlug + "travel");
  }

  const baseTravel = {
    en: ["travel", "wanderlust", "explore"],
    ru: ["путешествия", "туризм", "новыегоризонты"],
    kk: ["саяхат", "travelkz", "kazakhstan"]
  };

  const base = baseTravel[lang] || baseTravel.en;
  if (parsed.activities && parsed.activities.length) {
    for (const act of parsed.activities) {
      const w = act.toLowerCase().split(/\s+/).find(x => x.length >= 5 && /^[a-zа-яәіңғүұқөһ]+$/i.test(x));
      if (w) add(w.replace(/[.,!?]/g, ""));
    }
  }

  if (socialNetwork === "instagram") {
    base.forEach(add);
  } else if (socialNetwork === "linkedin") {
    add(lang === "ru" || lang === "kk" ? "карьера" : "networking");
    add(lang === "ru" || lang === "kk" ? "профессионализм" : "professional");
  } else if (socialNetwork === "telegram") {
    add(base[0]);
  }

  if (parsed.people && parsed.people.length && authorStyle.tonality.formality !== "formal") {
    add(lang === "ru" || lang === "kk" ? "друзья" : "friends");
  }

  const unique = Array.from(new Set(hashtags));
  let max;
  if (socialNetwork === "instagram") max = authorStyle.hashtags_per_post > 2 ? 12 : 8;
  else if (socialNetwork === "linkedin") max = 4;
  else max = 5;
  return unique.slice(0, max);
}

// ========= EXPANSION BY LANGUAGE + RAG CONTEXT =========

function expandInputByLanguage(parsed, authorStyle, socialNetwork, ragSentences) {
  ragSentences = ragSentences || [];
  const lang = authorStyle.language;
  const t = authorStyle.tonality;
  let base = "";

  const isTravel = parsed.location || parsed.activities.some(a =>
    /\b(visit|travel|trip|vacation|holiday|тур|саяхат|поездка)\b/i.test(a)
  );

  if (lang === "ru") {
    const parts = [];
    if (isTravel) {
      if (parsed.location) {
        parts.push(`Недавно побывал${""} в ${parsed.location}.`);
      } else {
        parts.push("Недавно выбрался в небольшое путешествие.");
      }
    } else {
      parts.push("Хочу поделиться небольшим опытом.");
    }

    if (parsed.location) {
      if (t.positivity === "positive") {
        parts.push("Город удивил атмосферой, сочетанием архитектуры, людей и настроения.");
      } else {
        parts.push("Место оставило смешанные, но очень живые впечатления.");
      }
    }

    if (parsed.activities.length) {
      const acts = parsed.activities.slice(0, 3).join(", ");
      parts.push(`За день успел ${acts}.`);
    }

    if (parsed.people && parsed.people.length) {
      const ppl = parsed.people.length === 1
        ? parsed.people[0]
        : parsed.people.slice(0, -1).join(", ") + " и " + parsed.people[parsed.people.length - 1];
      parts.push(`Отдельная радость — встретиться с ${ppl}. Такие встречи сильно заряжают.`);
    }

    if (socialNetwork === "linkedin") {
      parts.push("Такие поездки напоминают, зачем мы работаем над проектами и какие возможности открываются, когда выходишь из привычной среды.");
    } else {
      parts.push("Это один из тех дней, когда по-настоящему чувствуешь, что жизнь движется в нужном направлении.");
    }

    base = parts.join(" ");
  } else if (lang === "kk") {
    const parts = [];
    if (isTravel) {
      if (parsed.location) {
        parts.push(`${parsed.location} қаласына шағын сапар жасап келдім.`);
      } else {
        parts.push("Жуырда кішкентай ғана саяхат жасап қайттым.");
      }
    } else {
      parts.push("Бір шағын тәжірибеммен бөліскім келеді.");
    }

    if (parsed.location) {
      if (t.positivity === "positive") {
        parts.push("Қала атмосферасы, адамдардың энергиясы мен архитектурасы ерекше әсер қалдырды.");
      } else {
        parts.push("Қала туралы әсерлер әртүрлі, бірақ дәл сол үшін ол есте қалады.");
      }
    }

    if (parsed.activities.length) {
      const acts = parsed.activities.slice(0, 3).join(", ");
      parts.push(`Күн ішінде ${acts} жасап үлгердім.`);
    }

    if (parsed.people && parsed.people.length) {
      const ppl = parsed.people.length === 1
        ? parsed.people[0]
        : parsed.people.slice(0, -1).join(", ") + " және " + parsed.people[parsed.people.length - 1];
      parts.push(`Ең қуанышты сәттердің бірі — ${ppl} кездескенім. Осындай адамдар жанға үлкен мотивация береді.`);
    }

    if (socialNetwork === "linkedin") {
      parts.push("Осындай сапарлар кәсіби жолды қайта ой елегінен өткізіп, болашаққа басқа қырынан қарауға көмектеседі.");
    } else {
      parts.push("Келесі сапарды күтіп жүрмін, осы эмоциялардың өзі бастама жасауға жеткілікті себеп сияқты.");
    }

    base = parts.join(" ");
  } else {
    const parts = [];
    if (isTravel) {
      if (parsed.location) parts.push(`Just came back from ${parsed.location}.`);
      else parts.push("Just wrapped up a small trip that meant a lot to me.");
    } else {
      parts.push("Wanted to share a moment that stayed with me.");
    }

    if (parsed.location) {
      if (t.positivity === "positive") {
        parts.push("The place had a very special energy: architecture, people and small everyday details all came together.");
      } else {
        parts.push("The city left a mix of impressions, but exactly the kind that sticks in your memory.");
      }
    }

    if (parsed.activities.length) {
      const acts = parsed.activities.slice(0, 3).join(", ");
      parts.push(`During the day I managed to ${acts}.`);
    }

    if (parsed.people && parsed.people.length) {
      const ppl = parsed.people.length === 1
        ? parsed.people[0]
        : parsed.people.slice(0, -1).join(", ") + " and " + parsed.people[parsed.people.length - 1];
      parts.push(`The best part was sharing it with ${ppl}. Moments like that stay with you for a long time.`);
    }

    if (socialNetwork === "linkedin") {
      parts.push("Trips like this help to reset the perspective and remind why we are building our projects in the first place.");
    } else {
      parts.push("Already thinking about the next adventure.");
    }

    base = parts.join(" ");
  }

  if (ragSentences && ragSentences.length) {
    const extra = ragSentences.slice(0, 2).join(" ");
    base += " " + extra;
  }

  return base;
}

// ========= AUDIENCE TONE =========

function adjustToneForAudience(text, audience, lang) {
  const aud = audience.toLowerCase();
  let t = text;

  if (lang === "en") {
    if (aud.includes("professional") || aud.includes("colleague") || aud.includes("linkedin")) {
      t = t.replace(/\bcan't\b/gi, "cannot")
        .replace(/\bwon't\b/gi, "will not")
        .replace(/\bawesome\b/gi, "impressive")
        .replace(/\bcool\b/gi, "notable");
    }
  } else if (lang === "ru" || lang === "kk") {
    if (aud.includes("проф") || aud.includes("colleague") || aud.includes("работ") || aud.includes("офис")) {
      t = t.replace(/\bкруто\b/gi, "интересно")
        .replace(/\bофигенно\b/gi, "очень достойно")
        .replace(/\bжесть\b/gi, "довольно эмоционально");
    }
  }

  return t;
}

// ========= STYLE FEATURES =========

function extractStyleFeatures(posts) {
  const n = posts.length || 1;
  let emojis = 0, hashtags = 0, exclam = 0, quest = 0;
  let allTokens = [];
  const wordsPerPost = [];
  const charsPerPost = [];
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/gu;

  for (const p of posts) {
    const toks = tokenize(p);
    allTokens = allTokens.concat(toks);
    const words = toks.filter((t) => /\w/.test(t));
    wordsPerPost.push(words.length);
    charsPerPost.push(p.length);
    const emojiMatches = p.match(emojiRe);
    emojis += emojiMatches ? emojiMatches.length : 0;
    hashtags += toks.filter((t) => t.startsWith("#") || t.startsWith("Хэштег#")).length;
    exclam += (p.match(/!/g) || []).length;
    quest += (p.match(/\?/g) || []).length;
  }

  const avgWords = wordsPerPost.reduce((a, b) => a + b, 0) / wordsPerPost.length;
  const avgPostLength = charsPerPost.reduce((a, b) => a + b, 0) / charsPerPost.length;

  const freq = new Map();
  for (const t of allTokens) {
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = Array.from(freq.entries()).sort((a, b) => b[1] - a[1]).map(([w]) => w);
  const fav = top.filter((w) => /^\p{L}{4,}$/u.test(w)).slice(0, 15);

  const language = detectLanguage(posts);
  const tonality = analyzeTonality(posts, language);
  const sentencePatterns = extractSentencePatterns(posts);
  const characteristicPhrases = extractCharacteristicPhrases(posts, language);
  const openingClosing = extractOpeningClosingPhrases(posts);

  return {
    avg_words: avgWords,
    emojis_per_post: emojis / n,
    hashtags_per_post: hashtags / n,
    exclam_per_post: exclam / n,
    quest_per_post: quest / n,
    favorite_tokens: fav,
    language,
    tonality,
    sentencePatterns,
    characteristicPhrases,
    openingClosing,
    avgPostLength
  };
}

function styleTraits(f) {
  const t = [];
  const w = f.avg_words;
  if (w < 8) t.push("very short punchy posts");
  else if (w < 20) t.push("medium length casual posts");
  else t.push("long detailed posts");
  if (f.emojis_per_post > 1.5) t.push("uses a lot of emojis");
  else if (f.emojis_per_post < 0.2) t.push("almost no emojis");
  if (f.hashtags_per_post > 1) t.push("actively uses hashtags");
  if (f.quest_per_post > 0.5) t.push("often asks questions");
  if (f.exclam_per_post > 0.5) t.push("excited, emotional tone");

  if (f.tonality) {
    if (f.tonality.formality === "formal") t.push("formal professional style");
    else t.push("casual conversational style");
    if (f.tonality.positivity === "positive") t.push("positive enthusiastic tone");
  }

  if (f.language === "ru") t.push("writes in Russian");
  if (f.language === "kk") t.push("writes in Kazakh");

  return t;
}

// ========= SOCIAL NETWORK ADAPTATION =========

function adaptForSocialNetwork(text, socialNetwork, authorStyle) {
  let adapted = text;
  const sn = socialNetwork.toLowerCase();

  if (sn === "linkedin") {
    if (authorStyle.emojis_per_post < 1) {
      adapted = adapted.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
    }
    if (!adapted.match(/[.!?]$/)) adapted += ".";
  } else if (sn === "instagram") {
    if (authorStyle.emojis_per_post >= 0.5 && !adapted.match(/[\u{1F300}-\u{1FAFF}]/u)) {
      adapted += " ✨";
    }
  } else if (sn === "telegram") {
    const words = adapted.split(/\s+/);
    if (words.length > 140) {
      const sentences = adapted.split(/(?<=[.!?])\s+/);
      adapted = sentences.slice(0, Math.ceil(sentences.length * 0.7)).join(" ");
    }
  }

  return adapted;
}

// ========= MAIN GENERATION =========

function generateStyledPost(authorId, socialNetwork, topic, samplePosts) {
  const parsed = parseInput(topic);
  const authorStyle = extractStyleFeatures(samplePosts);
  const lang = authorStyle.language;

  const ragIndex = buildRAGIndex(samplePosts, lang);
  const ragContext = retrieveRAGContext(topic, ragIndex, 3);

  let baseText = expandInputByLanguage(parsed, authorStyle, socialNetwork, ragContext);

  const chain = buildMarkov(samplePosts, 2);
  if (chain.size > 0 && samplePosts.length >= 3) {
    const topicTokens = tokenize(topic).filter((x) => /\w/.test(x));
    const maxTokens = 160;
    const markovText = generateFromMarkov(chain, 2, maxTokens, topicTokens);
    if (markovText && !isGibberish(markovText)) {
      const sentences = markovText
        .replace(/#\w+/g, "")
        .split(/(?<=[.!?])\s+/)
        .filter(s => s.trim().length > 25 && s.trim().length < 220);
      if (sentences.length) {
        const extra = sentences.slice(0, 2).join(" ");
        baseText += " " + extra;
      }
    }
  }

  baseText = humanizeText(baseText, true);
  baseText = adjustToneForAudience(baseText, parsed.audience, lang);
  baseText = cutToFullSentence(baseText);

  const hashtags = generateHashtags(parsed, socialNetwork, authorStyle, lang);
  let finalPost = adaptForSocialNetwork(baseText, socialNetwork, authorStyle);
  if (hashtags.length) finalPost += "\n\n" + hashtags.join(" ");
  return finalPost;
}

// ========= STATE & DOM =========

let state = {
  authors: [],
  selectedId: "",
  socialNetwork: "instagram",
  topic: "I went to Dubai, explored fancy big towers, met John and Sarah, Audience: Relatives",
  status: "Ready",
  generated: "Generated post will appear here.",
  styleInfo: "Style metrics will appear here.",
  traits: [],
  activeAuthorChip: "no author",
  styleChip: "style: idle",
  parsedInput: null
};

const elements = {
  authorSelect: null,
  socialNetworkSelect: null,
  topicInput: null,
  generateBtn: null,
  analyzeBtn: null,
  status: null,
  generatedOutput: null,
  styleInfo: null,
  traits: null,
  activeAuthorChip: null,
  styleChip: null,
  parsedInput: null,
  parsedLocation: null,
  parsedActivities: null,
  parsedPeople: null,
  parsedAudience: null,
  detectedLang: null
};

function init() {
  elements.authorSelect = document.getElementById("authorSelect");
  elements.socialNetworkSelect = document.getElementById("socialNetworkSelect");
  elements.topicInput = document.getElementById("topicInput");
  elements.generateBtn = document.getElementById("generateBtn");
  elements.analyzeBtn = document.getElementById("analyzeBtn");
  elements.status = document.getElementById("status");
  elements.generatedOutput = document.getElementById("generatedOutput");
  elements.styleInfo = document.getElementById("styleInfo");
  elements.traits = document.getElementById("traits");
  elements.activeAuthorChip = document.getElementById("activeAuthorChip");
  elements.styleChip = document.getElementById("styleChip");
  elements.parsedInput = document.getElementById("parsedInput");
  elements.parsedLocation = document.getElementById("parsedLocation");
  elements.parsedActivities = document.getElementById("parsedActivities");
  elements.parsedPeople = document.getElementById("parsedPeople");
  elements.parsedAudience = document.getElementById("parsedAudience");
  elements.detectedLang = document.getElementById("detectedLang");

  if (!Array.isArray(window.authorsData)) {
    state.authors = [];
    state.status = "No authors dataset loaded";
  } else {
    state.authors = window.authorsData;
    if (state.authors.length > 0) {
      state.selectedId = state.authors[0].author_id;
      state.activeAuthorChip = state.authors[0].author_id;
      state.status = "Ready";
    } else {
      state.status = "No authors";
    }
  }

  elements.authorSelect.innerHTML =
    state.authors.length === 0
      ? '<option value="">No authors</option>'
      : state.authors.map(a => `<option value="${a.author_id}">${a.author_id}</option>`).join("");

  elements.authorSelect.value = state.selectedId;
  elements.topicInput.value = state.topic;

  elements.authorSelect.addEventListener("change", (e) => {
    state.selectedId = e.target.value;
    updateActiveAuthorChip();
  });

  elements.socialNetworkSelect.addEventListener("change", (e) => {
    state.socialNetwork = e.target.value;
  });

  elements.topicInput.addEventListener("input", (e) => {
    state.topic = e.target.value;
  });

  elements.generateBtn.addEventListener("click", handleGenerate);
  elements.analyzeBtn.addEventListener("click", handleAnalyzeStyle);

  updateUI();
  renderSocialMediaSection();
}

function updateUI() {
  elements.status.textContent = state.status;
  elements.generatedOutput.textContent = state.generated;
  elements.styleInfo.textContent = state.styleInfo;
  elements.activeAuthorChip.textContent = state.activeAuthorChip;
  elements.styleChip.textContent = state.styleChip;

  if (state.status.toLowerCase().includes("generat") || state.status.toLowerCase().includes("style")) {
    elements.status.className = "status success";
  } else if (state.status.toLowerCase().includes("error") || state.status.toLowerCase().includes("select") || state.status.toLowerCase().includes("no authors")) {
    elements.status.className = "status error";
  } else {
    elements.status.className = "status";
  }

  elements.traits.innerHTML = state.traits.map(tr => `<div class="trait">${tr}</div>`).join("");

  if (state.parsedInput) {
    elements.parsedInput.style.display = "block";
    elements.parsedLocation.textContent = `Location: ${state.parsedInput.location || "Not detected"}`;
    elements.parsedActivities.textContent = `Activities: ${state.parsedInput.activities.join(", ") || "Not detected"}`;
    elements.parsedPeople.textContent =
      `People met: ${state.parsedInput.people && state.parsedInput.people.length ? state.parsedInput.people.join(", ") : "Not detected"}`;
    elements.parsedAudience.textContent = `Audience: ${state.parsedInput.audience}`;
  } else {
    elements.parsedInput.style.display = "none";
  }

  if (elements.detectedLang && state.selectedId) {
    const author = state.authors.find(a => a.author_id === state.selectedId);
    if (author) {
      const feats = extractStyleFeatures(author.sample_posts);
      const code = feats.language;
      const map = { en: "English", ru: "Русский", kk: "Қазақша" };
      elements.detectedLang.textContent = map[code] || code;
    }
  }
}

function updateActiveAuthorChip() {
  const author = state.authors.find(a => a.author_id === state.selectedId);
  if (author) {
    state.activeAuthorChip = author.author_id;
  } else {
    state.activeAuthorChip = "no author";
  }
  elements.activeAuthorChip.textContent = state.activeAuthorChip;
}

function handleAnalyzeStyle() {
  const currentAuthor = state.authors.find(a => a.author_id === state.selectedId);
  if (!currentAuthor) {
    state.status = "Select author first";
    updateUI();
    return;
  }

  state.status = "Analyzing style...";
  state.styleChip = "style: loading";
  updateUI();

  const feats = extractStyleFeatures(currentAuthor.sample_posts);
  const tr = styleTraits(feats);
  const metrics = {
    avg_words: Math.round(feats.avg_words * 10) / 10,
    emojis_per_post: Math.round(feats.emojis_per_post * 10) / 10,
    hashtags_per_post: Math.round(feats.hashtags_per_post * 10) / 10,
    exclam_per_post: Math.round(feats.exclam_per_post * 10) / 10,
    quest_per_post: Math.round(feats.quest_per_post * 10) / 10,
    language: feats.language,
    formality: feats.tonality ? feats.tonality.formality : "unknown",
    positivity: feats.tonality ? feats.tonality.positivity : "unknown",
    favorite_tokens: feats.favorite_tokens,
    characteristic_phrases: feats.characteristicPhrases ? feats.characteristicPhrases.slice(0, 5) : []
  };

  state.styleInfo = JSON.stringify(metrics, null, 2);
  state.traits = tr;
  state.styleChip = "style: ready";
  state.status = "Style loaded";
  updateUI();
}

function handleGenerate() {
  const currentAuthor = state.authors.find(a => a.author_id === state.selectedId);
  if (!currentAuthor) {
    state.status = "Select author first";
    updateUI();
    return;
  }

  const t = state.topic.trim();
  if (!t) {
    state.status = "Enter topic";
    updateUI();
    return;
  }

  state.status = "Generating...";
  state.generated = "Generating post...";
  state.activeAuthorChip = currentAuthor.author_id;
  updateUI();

  const parsed = parseInput(t);
  state.parsedInput = parsed;

  const finalPost = generateStyledPost(
    currentAuthor.author_id,
    state.socialNetwork,
    t,
    currentAuthor.sample_posts
  );

  state.generated = finalPost;
  state.status = "Generation done";
  updateUI();
}
async function callOpenRouter(prompt) {
  const body = {
    model: "openai/gpt-4o-mini",
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that writes short human-like posts. " +
          "Always answer in the language of the user prompt. " +
          "Limit your answer to a maximum of 6 sentences."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  };

  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer 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",
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "Diffuzio Style Generator"
    },
    body: JSON.stringify(body)
  });

  const data = await res.json();
  return data.choices[0].message.content.trim();
}

function renderSocialMediaSection() {
  const socialLinks = [
    { name: "Facebook", url: "https://facebook.com", color: "#1877F2", icon: "📘" },
    { name: "Twitter", url: "https://twitter.com", color: "#1DA1F2", icon: "🐦" },
    { name: "Instagram", url: "https://instagram.com", color: "#E4405F", icon: "📷" },
    { name: "LinkedIn", url: "https://linkedin.com", color: "#0A66C2", icon: "💼" },
    { name: "YouTube", url: "https://youtube.com", color: "#FF0000", icon: "📺" },
    { name: "Email", url: "mailto:contact@codev-diffuzio.com", color: "#10a37f", icon: "✉️" }
  ];

  const section = document.getElementById("socialMediaSection");
  if (!section) return;

  section.innerHTML = `
    <div class="social-container">
      <h3 class="social-title">Connect With Us</h3>
      <p class="social-description">
        Follow us on social media for updates, tips, and insights on AI content creation
      </p>
      <div class="social-grid">
        ${socialLinks.map((social, index) => `
          <a href="${social.url}" target="_blank" rel="noopener noreferrer" 
             class="social-link" 
             style="animation-delay: ${index * 0.1}s">
            <div class="social-icon-wrapper" style="background-color: ${social.color}20">
              <span class="social-icon" style="color: ${social.color}; font-size: 28px;">${social.icon}</span>
            </div>
            <span class="social-name">${social.name}</span>
          </a>
        `).join("")}
      </div>
      <div class="social-footer">
        <p class="social-copyright">© 2024 CoDev × Diffuzio. All rights reserved.</p>
        <div class="social-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <a href="#">Contact Us</a>
        </div>
      </div>
    </div>
  `;
}
async function generatePostWithLLM(topic, socialNetwork, samplePosts) {
  const styleText = samplePosts.slice(0, 10).join("\n\n");

  const prompt = `
Соцсеть: ${socialNetwork}
Тема: ${topic}

Вот примеры стиля автора:
${styleText}

Сгенерируй один новый пост в этом стиле, по теме выше.
Максимум 6 предложений.
Без лишних пояснений, только готовый текст поста.
`.trim();

  const result = await callOpenRouter(prompt);
  return result;
}
const API_URL = "https://openrouter.ai/api/v1/chat/completions";
const API_KEY = "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";

async function callOpenRouter(prompt, uiModel) {
  const model = uiModel || "openai/gpt-4o-mini";

  const body = {
    model,
    messages: [
      {
        role: "system",
        content:
          "You are an assistant that writes short, human-like social media posts. " +
          "Always reply in the same language as the user prompt (it can be Russian, Kazakh or English). " +
          "Do not explain anything, output only the final post text. " +
          "Use natural, conversational style. " +
          "Limit your answer to a maximum of 6 sentences."
      },
      {
        role: "user",
        content: prompt
      }
    ]
  };

  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Authorization": `Bearer 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`,
      "Content-Type": "application/json",
      "HTTP-Referer": "http://localhost:5173",
      "X-Title": "Style Generator"
    },
    body: JSON.stringify(body)
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error("OpenRouter error: " + text);
  }

  const data = await res.json();
  if (!data.choices || !data.choices[0] || !data.choices[0].message) {
    throw new Error("Invalid OpenRouter response");
  }

  return data.choices[0].message.content.trim();
}

function buildPrompt() {
  const topicInput = document.getElementById("topicInput");
  const networkSelect = document.getElementById("networkSelect");
  const examplesInput = document.getElementById("examplesInput");
  const emotionSelect = document.getElementById("emotionSelect");
  const humanizerToggle = document.getElementById("humanizerToggle");

  const topic = topicInput ? topicInput.value.trim() : "";
  const network = networkSelect ? networkSelect.value.trim() : "";
  const examplesRaw = examplesInput ? examplesInput.value.trim() : "";
  const emotion = emotionSelect ? emotionSelect.value.trim() : "";
  const humanizerOn = humanizerToggle ? humanizerToggle.checked : false;

  const samplePosts = examplesRaw
    .split("\n")
    .map(s => s.trim())
    .filter(Boolean);

  const styleBlock = samplePosts.slice(0, 20).join("\n\n");

  let extraHumanizer = "";
  if (humanizerOn) {
    extraHumanizer =
      "Пиши максимально по-человечески: легкий разговорный стиль, " +
      "без шаблонных фраз, без роботизированных конструкций. " +
      "Избегай очевидных клише и слишком 'маркетингового' тона. ";
  }

  const prompt = `
Социальная сеть: ${network || "generic"}
Тема поста: ${topic || "универсальная тема"}

Примеры стиля автора (это очень важно, пиши в таком же стиле):
${styleBlock || "(примеров мало, но все равно пост должен выглядеть естественно)"}

Эмоциональный тон: ${emotion || "нейтральный, но живой"}

${extraHumanizer}

Сгенерируй один новый пост по указанной теме в стиле этих примеров.
Максимум 6 предложений.
Без списков, без нумерации, без пояснений.
Выведи только финальный текст поста.
`.trim();

  return prompt;
}

async function handleGenerateClick() {
  const btn = document.getElementById("generateBtn");
  const resultOutput = document.getElementById("resultOutput");
  const modelSelect = document.getElementById("modelSelect");

  const uiModel = modelSelect ? modelSelect.value.trim() : "openai/gpt-4o-mini";

  if (!btn || !resultOutput) {
    console.error("Missing DOM elements for generation");
    return;
  }

  const prompt = buildPrompt();
  if (!prompt) {
    resultOutput.value = "Пустой промпт. Заполни тему и примеры постов.";
    return;
  }

  btn.disabled = true;
  const originalText = btn.innerText;
  btn.innerText = "Generating...";

  try {
    const responseText = await callOpenRouter(prompt, uiModel);

    if ("value" in resultOutput) {
      resultOutput.value = responseText;
    } else {
      resultOutput.textContent = responseText;
    }
  } catch (err) {
    console.error(err);
    const msg = "Ошибка при генерации. Проверь API ключ и консоль.";
    if ("value" in resultOutput) {
      resultOutput.value = msg;
    } else {
      resultOutput.textContent = msg;
    }
  } finally {
    btn.disabled = false;
    btn.innerText = originalText;
  }
}

function initGenerator() {
  const btn = document.getElementById("generateBtn");
  if (!btn) return;
  btn.addEventListener("click", () => {
    handleGenerateClick();
  });
}

document.addEventListener("DOMContentLoaded", () => {
  initGenerator();
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
