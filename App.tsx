import React, { useEffect, useMemo, useState } from "react";
import { authorsData } from "./authorsData";

type Author = {
  author_id: string;
  social_network: string;
  sample_posts: string[];
};

type Tonality = {
  formality: "formal" | "informal";
  formalityRatio: number;
  positivity: "positive" | "neutral";
  positivityScore: number;
};

type SentencePatterns = {
  avgSentenceLength: number;
  shortSentences: number;
  longSentences: number;
  questions: number;
  exclamations: number;
  startsWithI: number;
  startsWithVerb: number;
  totalSentences: number;
};

type OpeningClosing = {
  openings: string[];
  closings: string[];
};

type StyleFeatures = {
  avg_words: number;
  emojis_per_post: number;
  hashtags_per_post: number;
  exclam_per_post: number;
  quest_per_post: number;
  favorite_tokens: string[];
  language: string;
  tonality: Tonality;
  sentencePatterns: SentencePatterns;
  characteristicPhrases: string[];
  openingClosing: OpeningClosing;
  avgPostLength: number;
};

type StyleTraits = string[];

type ParsedInput = {
  content: string;
  location?: string;
  activities: string[];
  people: string[];
  audience: string;
};

// ===== токены / марковка / humanizer =====

function tokenize(text: string): string[] {
  const regex = /\w+|[^\w\s]/gu;
  const tokens: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = regex.exec(text)) !== null) tokens.push(m[0]);
  return tokens;
}

function detokenize(tokens: string[]): string {
  let result = "";
  for (const t of tokens) {
    if (/^[\.\,\!\?\:\;]$/.test(t)) result += t;
    else if (result === "") result = t;
    else result += " " + t;
  }
  return result;
}

function buildMarkov(posts: string[], order = 2): Map<string, string[]> {
  const chain = new Map<string, string[]>();
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

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function generateFromMarkov(
  chain: Map<string, string[]>,
  order: number,
  maxTokens: number,
  topicWords: string[]
): string {
  const keys = Array.from(chain.keys());
  if (!keys.length) return "";
  let startKey: string | null = null;
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
    if (
      /[\.!\?]/.test(next) &&
      tokens.length > Math.max(40, maxTokens * 0.8)
    )
      break;
  }
  return detokenize(tokens);
}

// ===== Advanced Style Analysis =====

function detectLanguage(posts: string[]): string {
  const allText = posts.join(" ").toLowerCase();
  const cyrillicCount = (allText.match(/[\u0400-\u04FF]/g) || []).length;
  const latinCount = (allText.match(/[a-zA-Z]/g) || []).length;
  const arabicCount = (allText.match(/[\u0600-\u06FF]/g) || []).length;
  const cjkCount = (allText.match(/[\u4E00-\u9FFF\u3040-\u30FF]/g) || []).length;
  
  const total = cyrillicCount + latinCount + arabicCount + cjkCount;
  if (total === 0) return "en";
  
  if (cyrillicCount / total > 0.3) return "ru";
  if (arabicCount / total > 0.3) return "ar";
  if (cjkCount / total > 0.3) return "cjk";
  return "en";
}

function analyzeTonality(posts: string[]): Tonality {
  const allText = posts.join(" ").toLowerCase();
  
  const formalWords = ["opportunity", "regarding", "therefore", "furthermore", "however", "professional", "strategic", "commitment", "impressive", "remarkable", "approach", "framework", "insights", "productive", "excellent"];
  const informalWords = ["awesome", "cool", "amazing", "crazy", "wild", "love", "best", "great", "fun", "vibes", "loving", "wow", "fantastic"];
  
  let formalScore = 0;
  let informalScore = 0;
  
  for (const word of formalWords) {
    formalScore += (allText.match(new RegExp("\\b" + word + "\\b", "gi")) || []).length;
  }
  for (const word of informalWords) {
    informalScore += (allText.match(new RegExp("\\b" + word + "\\b", "gi")) || []).length;
  }
  
  const emojiCount = (posts.join(" ").match(/[\u{1F300}-\u{1FAFF}]/gu) || []).length;
  informalScore += emojiCount * 2;
  
  const positiveWords = ["amazing", "incredible", "beautiful", "wonderful", "excellent", "fantastic", "love", "great", "grateful", "exciting", "impressive", "breathtaking", "stunning", "fascinating"];
  let positiveScore = 0;
  for (const word of positiveWords) {
    positiveScore += (allText.match(new RegExp("\\b" + word + "\\b", "gi")) || []).length;
  }
  
  return {
    formality: formalScore > informalScore ? "formal" : "informal",
    formalityRatio: formalScore / Math.max(1, formalScore + informalScore),
    positivity: positiveScore > posts.length * 0.8 ? "positive" : "neutral",
    positivityScore: positiveScore / posts.length
  };
}

function extractSentencePatterns(posts: string[]): SentencePatterns {
  const patterns: SentencePatterns = {
    avgSentenceLength: 0,
    shortSentences: 0,
    longSentences: 0,
    questions: 0,
    exclamations: 0,
    startsWithI: 0,
    startsWithVerb: 0,
    totalSentences: 0
  };
  
  const verbStarters = ["exploring", "walking", "having", "just", "visited", "attended", "had", "loving", "feeling"];
  
  for (const post of posts) {
    const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
    patterns.totalSentences += sentences.length;
    
    for (const sent of sentences) {
      const words = sent.trim().split(/\s+/);
      patterns.avgSentenceLength += words.length;
      
      if (words.length <= 8) patterns.shortSentences++;
      else if (words.length > 20) patterns.longSentences++;
      
      const firstWord = words[0]?.toLowerCase() || "";
      if (firstWord === "i" || firstWord === "i'm" || firstWord === "i've") patterns.startsWithI++;
      if (verbStarters.some(v => firstWord.startsWith(v))) patterns.startsWithVerb++;
    }
    
    patterns.questions += (post.match(/\?/g) || []).length;
    patterns.exclamations += (post.match(/!/g) || []).length;
  }
  
  patterns.avgSentenceLength = patterns.avgSentenceLength / Math.max(1, patterns.totalSentences);
  
  return patterns;
}

function extractOpeningClosingPhrases(posts: string[]): OpeningClosing {
  const openings: string[] = [];
  const closings: string[] = [];
  
  for (const post of posts) {
    const sentences = post.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length > 0) {
      const opening = sentences[0].trim();
      if (opening.length > 5 && opening.length < 100) {
        openings.push(opening);
      }
    }
    if (sentences.length > 1) {
      const closing = sentences[sentences.length - 1].trim();
      if (closing.length > 5 && closing.length < 100) {
        closings.push(closing);
      }
    }
  }
  
  return { openings, closings };
}

function extractCharacteristicPhrases(posts: string[]): string[] {
  const allText = posts.join(" ");
  const phrases: { phrase: string; count: number }[] = [];
  
  const words = allText.split(/\s+/);
  const phraseMap = new Map<string, number>();
  
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ").toLowerCase();
      if (/^[\w\s]+$/.test(phrase)) {
        phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
      }
    }
  }
  
  for (const [phrase, count] of phraseMap.entries()) {
    if (count >= 2 && phrase.split(" ").length >= 2) {
      phrases.push({ phrase, count });
    }
  }
  
  phrases.sort((a, b) => b.count - a.count);
  return phrases.slice(0, 15).map(p => p.phrase);
}

function humanizeText(text: string, preserveStyle = false): string {
  let h = text;
  h = h.replace(/—/g, ",");
  h = h.replace(/\*\*/g, "");
  h = h.replace(/\*/g, "");
  h = h.replace(/#{1,6}\s/g, "");
  
  // Only apply aggressive replacements when not preserving style
  if (!preserveStyle) {
    const banned: [RegExp, string][] = [
      [/\butilize\b/gi, "use"],
      [/\butilizing\b/gi, "using"],
      [/\bdelve\b/gi, "explore"],
      [/\bembark\b/gi, "start"],
      [/\bgame-changer\b/gi, "major change"],
      [/\bdisruptive\b/gi, "new"],
      [/\bdive deep\b/gi, "examine"],
      [/\btapestry\b/gi, "mix"],
      [/\billuminate\b/gi, "show"],
      [/\bunveil\b/gi, "reveal"],
      [/\belucidate\b/gi, "explain"],
      [/\bgroundbreaking\b/gi, "new"],
      [/\bever-evolving\b/gi, "changing"]
    ];
    for (const [re, repl] of banned) h = h.replace(re, repl);
    
    const transitions: [RegExp, string][] = [
      [/In conclusion\b/gi, "Bottom line"],
      [/In summary\b/gi, "To sum up"],
      [/Furthermore\b/gi, "Plus"],
      [/However\b/gi, "But"],
      [/Therefore\b/gi, "So"],
      [/Additionally\b/gi, "Also"],
      [/Moreover\b/gi, "And"],
      [/Hence\b/gi, "So"]
    ];
    for (const [re, repl] of transitions) h = h.replace(re, repl);
    h = h.replace(/It is important to note that\b/gi, "Note:");
    h = h.replace(/It should be noted that\b/gi, "Note:");
    h = h.replace(/It is worth mentioning that\b/gi, "");
    h = h.replace(/In a world where\b/gi, "When");
    h = h.replace(/not just .+?, but also\b/gi, "and");
    
    const fillers = ["very", "really", "literally", "actually", "certainly", "probably", "basically"];
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

function cutToFullSentence(text: string): string {
  const t = text.trim();
  if (!t) return t;
  const lastDot = t.lastIndexOf(".");
  const lastExc = t.lastIndexOf("!");
  const lastQ = t.lastIndexOf("?");
  const last = Math.max(lastDot, lastExc, lastQ);
  if (last === -1) return t;
  return t.slice(0, last + 1).trim();
}

function isGibberish(text: string): boolean {
  const tokens = tokenize(text);
  if (tokens.length < 15) return false;
  // Support any Unicode letter (works with all languages)
  const single = tokens.filter((t) => /^\p{L}$/u.test(t)).length;
  const longWords = tokens.filter((t) =>
    /^\p{L}{4,}$/u.test(t)
  ).length;
  const ratioSingle = single / tokens.length;
  const ratioLong = longWords / tokens.length;
  return ratioSingle > 0.45 && ratioLong < 0.25;
}

// ===== Parse input format =====
function parseInput(input: string): ParsedInput {
  const audienceMatch = input.match(/Audience:\s*([^,]+)/i);
  const audience = audienceMatch ? audienceMatch[1].trim() : "General";
  
  let content = input.replace(/Audience:\s*[^,]+/i, "").trim();
  content = content.replace(/,\s*$/, "").trim();
  
  const locationMatch = content.match(/\b(Dubai|Paris|London|Tokyo|New York|Moscow|Berlin|Rome|Barcelona|Amsterdam|Vienna|Prague|Bangkok|Singapore|Sydney|Melbourne|Toronto|Vancouver|Los Angeles|San Francisco|Miami|Las Vegas|Bali|Maldives|Santorini|Istanbul|Cairo|Marrakech|Madrid|Lisbon|Stockholm|Oslo|Copenhagen|Helsinki|Warsaw|Krakow|Budapest|Athens|Zurich|Geneva|Monaco|Monte Carlo|Venice|Florence|Milan|Naples|Porto|Seville|Granada|Valencia|Ibiza|Mykonos|Crete|Rhodes)\b/i);
  const location = locationMatch ? locationMatch[1] : undefined;
  
  // Extract people/names
  const people: string[] = [];
  const peoplePatterns = [
    /(met|met with|saw|caught up with|hung out with|spent time with|reunited with|visited with|had dinner with|had lunch with|had coffee with)\s+([^,]+?)(?=,|$)/gi
  ];
  
  for (const pattern of peoplePatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const personText = match[0].trim();
      const namesMatch = personText.match(/(?:met|met with|saw|caught up with|hung out with|spent time with|reunited with|visited with|had dinner with|had lunch with|had coffee with)\s+(.+)/i);
      if (namesMatch) {
        let names = namesMatch[1].trim();
        const namesList = names.replace(/\s+and\s+/gi, ', ').split(',').map(n => n.trim()).filter(n => n.length > 0);
        const filteredNames = namesList.filter(name => {
          const lower = name.toLowerCase();
          return !lower.match(/^(my|an|a|the|friend|friends|colleague|colleagues|family|relative|relatives)$/);
        });
        if (filteredNames.length > 0) {
          people.push(...filteredNames);
        }
      }
    }
  }
  
  // Filter out landmarks from people list
  const landmarks = ["eiffel tower", "big ben", "tower bridge", "statue of liberty", "colosseum", "taj mahal", 
    "great wall", "pyramids", "burj khalifa", "sydney opera house", "golden gate", "christ the redeemer",
    "tower", "bridge", "monument", "statue", "cathedral", "palace", "castle", "museum", "gallery"];
  const uniquePeople = Array.from(new Set(people.map(p => p.trim()).filter(p => {
    if (p.length === 0) return false;
    const lower = p.toLowerCase();
    return !landmarks.some(l => lower.includes(l));
  })));
  
  // Extract activities
  const activities: string[] = [];
  const activityPatterns = [
    /(explored|visited|saw|discovered|experienced|enjoyed|tried|tasted|walked|hiked|drove|flew|stayed|relaxed|shopped|danced|partied|swam|surfed|skied|climbed|photographed|admired|appreciated)\s+([^,]+?)(?=,|$)/gi,
    /(went to|traveled to|flew to|drove to)\s+([^,]+?)(?=,|$)/gi
  ];
  
  for (const pattern of activityPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const activity = match[0].trim();
      if (activity && !activities.includes(activity) && 
          !activity.toLowerCase().includes('audience') &&
          !activity.toLowerCase().match(/^(met|saw|met with|caught up with|hung out with)/)) {
        activities.push(activity);
      }
    }
  }
  
  if (activities.length === 0) {
    const phrases = content.split(',').map(p => p.trim()).filter(p => {
      const lower = p.toLowerCase();
      if (p.length === 0 || lower.includes('audience')) return false;
      if (locationMatch && locationMatch[1] && lower.includes(locationMatch[1].toLowerCase())) return false;
      if (lower.match(/^(met|saw|met with|caught up with|hung out with)/)) return false;
      return true;
    });
    activities.push(...phrases.slice(0, 3));
  }
  
  return { content, location, activities, people: uniquePeople, audience };
}

// ===== Generate hashtags =====
function generateHashtags(parsed: ParsedInput, socialNetwork: string, authorStyle?: StyleFeatures): string[] {
  const hashtags: string[] = [];
  
  if (authorStyle && authorStyle.hashtags_per_post >= 0.5) {
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`);
      if (authorStyle.tonality && authorStyle.tonality.formality !== "formal") {
        hashtags.push(`#${loc}travel`);
      }
    }
  } else if (authorStyle && authorStyle.hashtags_per_post < 0.5) {
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`);
    }
    return Array.from(new Set(hashtags)).slice(0, 3);
  } else {
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`, `#${loc}travel`);
    }
  }
  
  for (const activity of parsed.activities) {
    const words = activity.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4 && /^[a-z]+$/.test(word)) {
        let cleanWord = word;
        if (word.endsWith('ed') && word.length > 6) {
          cleanWord = word.slice(0, -2);
          if (/([bcdfghjklmnpqrstvwxyz])\1$/.test(cleanWord)) {
            cleanWord = cleanWord.slice(0, -1);
          }
        } else if (word.endsWith('ing') && word.length > 7) {
          cleanWord = word.slice(0, -3);
          if (/([bcdfghjklmnpqrstvwxyz])\1$/.test(cleanWord)) {
            cleanWord = cleanWord.slice(0, -1);
          }
        }
        if (cleanWord.length >= 5 && !["went", "that", "this", "with", "from", "have", "been", "made", "took", "came", "very", "explor", "explo"].includes(cleanWord)) {
          hashtags.push(`#${cleanWord}`);
        }
      }
    }
  }
  
  const sn = socialNetwork.toLowerCase();
  if (sn === 'instagram') {
    hashtags.push('#travel', '#wanderlust', '#explore');
  } else if (sn === 'linkedin') {
    if (parsed.location) {
      hashtags.push('#businesstravel');
    }
    hashtags.push('#networking', '#professional');
  } else if (sn === 'telegram') {
    hashtags.push('#travel');
  }
  
  if (parsed.people && parsed.people.length > 0 && authorStyle && authorStyle.tonality.formality !== "formal") {
    hashtags.push('#meetup', '#friends');
  }
  
  const unique = Array.from(new Set(hashtags));
  let maxHashtags: number;
  if (sn === 'instagram') {
    maxHashtags = authorStyle && authorStyle.hashtags_per_post > 2 ? 10 : 6;
  } else if (sn === 'linkedin') {
    maxHashtags = 4;
  } else {
    maxHashtags = 4;
  }
  
  return unique.slice(0, maxHashtags);
}

// ===== Expand input into full post =====
function expandInput(parsed: ParsedInput, authorStyle: StyleFeatures, socialNetwork: string): string {
  const parts: string[] = [];
  const { tonality, emojis_per_post } = authorStyle;
  
  const isTravelTopic = parsed.location || 
    parsed.activities.some(a => /\b(visit|travel|explore|trip|vacation|holiday|tour|sight)\b/i.test(a));
  
  if (tonality.formality === "formal") {
    if (parsed.location) {
      parts.push(`Recently had the opportunity to visit ${parsed.location}.`);
    } else if (isTravelTopic) {
      parts.push("Excited to share a recent travel experience.");
    } else {
      parts.push("Excited to share a recent experience.");
    }
  } else {
    if (isTravelTopic) {
      const informalOpenings = [
        parsed.location ? `Just arrived in ${parsed.location}!` : "What an adventure!",
        parsed.location ? `${parsed.location} vibes!` : "Loving this!",
        parsed.location ? `Exploring ${parsed.location}!` : "Travel time!",
      ];
      parts.push(randomChoice(informalOpenings));
    } else {
      const generalOpenings = [
        "Excited to share this!",
        "Big news!",
        "Reflecting on something important.",
        "Had an interesting experience recently.",
      ];
      parts.push(randomChoice(generalOpenings));
    }
  }
  
  if (parsed.location && !parts[0].toLowerCase().includes(parsed.location.toLowerCase())) {
    if (tonality.formality === "formal") {
      parts.push(`The city offers a unique blend of culture and innovation.`);
    } else if (tonality.positivity === "positive") {
      parts.push(`It's absolutely breathtaking!`);
    } else {
      parts.push(`So much to see and do here.`);
    }
  }
  
  if (parsed.activities.length > 0) {
    const cleanActivities = parsed.activities.map(a => {
      let cleaned = a.trim().replace(/^I\s+/i, '');
      if (parsed.location && cleaned.toLowerCase().includes(parsed.location.toLowerCase())) {
        return null;
      }
      const isActivity = /^(explored|visited|saw|discovered|experienced|enjoyed|tried|tasted|walked|hiked|drove|flew|stayed|relaxed|shopped|danced|partied|swam|surfed|skied|climbed|photographed|admired|appreciated|went|traveled|met|learned|attended|had)/i.test(cleaned);
      
      if (isActivity) {
        if (cleaned.match(/^(explored|visited|saw)\s+/i)) {
          cleaned = cleaned.replace(/^(explored|visited|saw)\s+(?!the\s)/i, (match, verb) => {
            return verb + ' the ';
          });
        }
        return cleaned;
      } else {
        const lowerCleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
        return `reflected on ${lowerCleaned}`;
      }
    }).filter((a): a is string => a !== null && a.length > 0);
    
    if (cleanActivities.length > 0) {
      if (tonality.formality === "formal") {
        const activityText = cleanActivities.join(" and ");
        if (parsed.location) {
          parts.push(`During my time there, I ${activityText}.`);
        } else {
          parts.push(`I ${activityText}.`);
        }
        parts.push("The experience provided valuable insights and memorable moments.");
      } else {
        const activityText = cleanActivities.length === 1 
          ? cleanActivities[0]
          : cleanActivities.slice(0, -1).join(', ') + ' and ' + cleanActivities[cleanActivities.length - 1];
        
        const positiveAdjective = authorStyle.favorite_tokens.find(t => 
          ["amazing", "incredible", "stunning", "beautiful", "awesome", "wonderful", "fantastic"].includes(t.toLowerCase())
        ) || (tonality.positivity === "positive" ? "amazing" : "great");
        
        parts.push(`I ${activityText}. It was ${positiveAdjective}!`);
      }
    }
  }
  
  if (parsed.people && parsed.people.length > 0) {
    const peopleText = parsed.people.length === 1 
      ? parsed.people[0]
      : parsed.people.slice(0, -1).join(', ') + ' and ' + parsed.people[parsed.people.length - 1];
    
    if (tonality.formality === "formal") {
      parts.push(`I also had the pleasure of meeting ${peopleText}.`);
    } else {
      parts.push(`Met ${peopleText} along the way!`);
    }
  }
  
  return parts.join(' ');
}

// ===== Adapt for social network =====
function adaptForSocialNetwork(text: string, socialNetwork: string, authorStyle: StyleFeatures): string {
  let adapted = text;
  const sn = socialNetwork.toLowerCase();
  
  if (sn === "linkedin") {
    if (authorStyle.emojis_per_post < 1) {
      adapted = adapted.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
    } else {
      let count = 0;
      adapted = adapted.replace(/[\u{1F300}-\u{1FAFF}]/gu, (match) => {
        count++;
        return count <= 2 ? match : "";
      });
    }
    if (!adapted.match(/\.$|!$|\?$/)) {
      adapted += ".";
    }
  } else if (sn === "instagram") {
    if (authorStyle.emojis_per_post >= 0.5 && !adapted.match(/[\u{1F300}-\u{1FAFF}]/u)) {
      adapted += " ✨";
    }
  } else if (sn === "telegram") {
    const words = adapted.split(/\s+/);
    if (words.length > 100) {
      const sentences = adapted.split(/(?<=[.!?])\s+/);
      adapted = sentences.slice(0, Math.ceil(sentences.length * 0.7)).join(" ");
    }
  } else if (sn === "facebook") {
    if (authorStyle.quest_per_post >= 0.5 && !adapted.includes("?")) {
      adapted += " What do you think?";
    }
  }
  
  return adapted;
}

// ===== Main generation function =====
function generateStyledPost(authorId: string, socialNetwork: string, topic: string, samplePosts: string[]): string {
  const parsed = parseInput(topic);
  const authorStyle = extractStyleFeatures(samplePosts);
  let generatedText = expandInput(parsed, authorStyle, socialNetwork);
  
  const chain = buildMarkov(samplePosts, 2);
  if (chain.size > 0 && samplePosts.length >= 3 && authorStyle.tonality.formality !== "formal") {
    const topicTokens = tokenize(topic).filter((x) => /\w/.test(x));
    const maxTokens = 80;
    
    const markovText = generateFromMarkov(chain, 2, maxTokens, topicTokens);
    if (markovText && !isGibberish(markovText)) {
      const cleanMarkovText = markovText.replace(/#\w+/g, '').trim();
      const markovSentences = cleanMarkovText.split(/(?<=[.!?])\s+/).filter(s => {
        const trimmed = s.trim();
        return trimmed.length > 15 && trimmed.length < 120 && !trimmed.startsWith('#');
      });
      
      if (markovSentences.length > 0) {
        const existingLower = generatedText.toLowerCase();
        const relevantSentences = markovSentences
          .filter(s => {
            const lower = s.toLowerCase();
            if (/^(and|but|so|or|the|a|is|are)\s/i.test(s.trim())) {
              return false;
            }
            const isRelevant = (parsed.location && lower.includes(parsed.location.toLowerCase())) ||
                   lower.includes("architecture") ||
                   lower.includes("experience") ||
                   lower.includes("amazing") ||
                   lower.includes("incredible") ||
                   lower.includes("view") ||
                   lower.includes("city") ||
                   lower.includes("love");
            const words = lower.split(/\s+/).filter(w => w.length > 3);
            const uniqueWords = words.filter(w => !existingLower.includes(w));
            const noveltyRatio = uniqueWords.length / Math.max(1, words.length);
            return isRelevant && noveltyRatio > 0.4;
          })
          .slice(0, 1);
        
        if (relevantSentences.length > 0) {
          generatedText += " " + relevantSentences[0].trim();
        }
      }
    }
  }
  
  generatedText = humanizeText(generatedText, true);
  generatedText = cutToFullSentence(generatedText);
  generatedText = adaptForSocialNetwork(generatedText, socialNetwork, authorStyle);
  
  const hashtags = generateHashtags(parsed, socialNetwork, authorStyle);
  const hashtagString = hashtags.length > 0 ? hashtags.join(' ') : '';
  const finalPost = generatedText + (hashtagString ? '\n\n' + hashtagString : '');
  
  return finalPost;
}

function extractStyleFeatures(posts: string[]): StyleFeatures {
  const n = posts.length;
  if (!n) {
    return {
      avg_words: 0,
      emojis_per_post: 0,
      hashtags_per_post: 0,
      exclam_per_post: 0,
      quest_per_post: 0,
      favorite_tokens: [],
      language: "en",
      tonality: { formality: "informal", formalityRatio: 0.5, positivity: "neutral", positivityScore: 0 },
      sentencePatterns: {
        avgSentenceLength: 0, shortSentences: 0, longSentences: 0,
        questions: 0, exclamations: 0, startsWithI: 0, startsWithVerb: 0, totalSentences: 0
      },
      characteristicPhrases: [],
      openingClosing: { openings: [], closings: [] },
      avgPostLength: 0
    };
  }
  
  let emojis = 0;
  let hashtags = 0;
  let exclam = 0;
  let quest = 0;
  let allTokens: string[] = [];
  const wordsPerPost: number[] = [];
  const charsPerPost: number[] = [];
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/gu;
  
  for (const p of posts) {
    const toks = tokenize(p);
    allTokens = allTokens.concat(toks);
    const words = toks.filter((t) => /\w/.test(t));
    wordsPerPost.push(words.length);
    charsPerPost.push(p.length);
    const emojiMatches = p.match(emojiRe);
    emojis += emojiMatches ? emojiMatches.length : 0;
    hashtags += toks.filter((t) => t.startsWith("#")).length;
    exclam += (p.match(/!/g) || []).length;
    quest += (p.match(/\?/g) || []).length;
  }
  
  const avgWords = wordsPerPost.reduce((a, b) => a + b, 0) / (wordsPerPost.length || 1);
  const avgPostLength = charsPerPost.reduce((a, b) => a + b, 0) / (charsPerPost.length || 1);
  const emojisPerPost = emojis / n;
  const hashtagsPerPost = hashtags / n;
  const exclamPerPost = exclam / n;
  const questPerPost = quest / n;
  
  const freq = new Map<string, number>();
  for (const t of allTokens) {
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  const fav = top.filter((w) => /^\p{L}{4,}$/u.test(w)).slice(0, 10);
  
  const language = detectLanguage(posts);
  const tonality = analyzeTonality(posts);
  const sentencePatterns = extractSentencePatterns(posts);
  const characteristicPhrases = extractCharacteristicPhrases(posts);
  const openingClosing = extractOpeningClosingPhrases(posts);
  
  return {
    avg_words: avgWords,
    emojis_per_post: emojisPerPost,
    hashtags_per_post: hashtagsPerPost,
    exclam_per_post: exclamPerPost,
    quest_per_post: questPerPost,
    favorite_tokens: fav,
    language,
    tonality,
    sentencePatterns,
    characteristicPhrases,
    openingClosing,
    avgPostLength
  };
}

function styleTraits(f: StyleFeatures): StyleTraits {
  const t: string[] = [];
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
  
  if (f.language && f.language !== "en") {
    const langNames: Record<string, string> = { ru: "Russian", ar: "Arabic", cjk: "Chinese/Japanese" };
    t.push(`writes in ${langNames[f.language] || f.language}`);
  }
  
  return t;
}

const App = () => {
  const [authors, setAuthors] = useState<Author[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [socialNetwork, setSocialNetwork] = useState("instagram");
  const [topic, setTopic] = useState(
    "I went to Dubai, explored fancy big towers, Audience: Relatives"
  );
  const [status, setStatus] = useState("Ready");
  const [generated, setGenerated] = useState(
    "Generated post will appear here."
  );
  const [styleInfo, setStyleInfo] = useState(
    "Style metrics will appear here."
  );
  const [traits, setTraits] = useState<StyleTraits>([]);
  const [activeAuthorChip, setActiveAuthorChip] = useState("no author");
  const [styleChip, setStyleChip] = useState("style: idle");
  const [parsedInput, setParsedInput] = useState<ParsedInput | null>(null);

  useEffect(() => {
    const casted = authorsData as Author[];
    setAuthors(casted);
    if (casted.length > 0) {
      setSelectedId(casted[0].author_id);
      setActiveAuthorChip(casted[0].author_id);
      setStatus("Ready");
    } else {
      setStatus("No authors");
    }
  }, []);

  const currentAuthor = useMemo(
    () => authors.find((a) => a.author_id === selectedId) || null,
    [authors, selectedId]
  );

  const handleAnalyzeStyle = () => {
    if (!currentAuthor) {
      setStatus("Select author first");
      return;
    }
    setStatus("Analyzing style...");
    setStyleChip("style: loading");
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
    setStyleInfo(JSON.stringify(metrics, null, 2));
    setTraits(tr);
    setStyleChip("style: ready");
    setStatus("Style loaded");
  };

  const handleGenerate = () => {
    if (!currentAuthor) {
      setStatus("Select author first");
      return;
    }
    const t = topic.trim();
    if (!t) {
      setStatus("Enter topic");
      return;
    }

    setStatus("Generating...");
    setGenerated("Generating post...");
    setActiveAuthorChip(currentAuthor.author_id);

    // Parse input and store for display
    const parsed = parseInput(t);
    setParsedInput(parsed);

    // Use the new styled post generation function
    const finalPost = generateStyledPost(
      currentAuthor.author_id,
      socialNetwork,
      t,
      currentAuthor.sample_posts
    );
    
    setGenerated(finalPost);
    setStatus("Generation done");
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        overflow: "auto",
        background:
          "radial-gradient(circle at top left, rgba(79,70,229,0.12), transparent 55%), radial-gradient(circle at bottom right, rgba(15,118,110,0.12), transparent 55%), #020617",
        display: "flex",
        justifyContent: "center",
        alignItems: "stretch",
        padding: "20px 28px",
        boxSizing: "border-box",
        color: "#e5e7eb",
        fontFamily:
          'system-ui, -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif'
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: 1400,
          borderRadius: 20,
          background: "rgba(15,23,42,0.92)",
          border: "1px solid rgba(30,64,175,0.4)",
          boxShadow: "0 22px 60px rgba(15,23,42,0.9)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 16,
          boxSizing: "border-box"
        }}
      >
        <header
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            flexWrap: "wrap"
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "999px",
                background:
                  "radial-gradient(circle at 30% 20%, #f9fafb, transparent 60%), radial-gradient(circle at 80% 80%, rgba(79,70,229,0.7), transparent 70%)",
                boxShadow: "0 0 16px rgba(79,70,229,0.6)"
              }}
            />
            <div>
              <div
                style={{
                  fontWeight: 600,
                  fontSize: "1rem",
                  letterSpacing: "0.04em",
                  textTransform: "uppercase"
                }}
              >
                AI POST GENERATOR
              </div>
              <div style={{ fontSize: "0.8rem", color: "#9ca3af" }}>
                Transform short notes into engaging social media posts
              </div>
            </div>
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 6,
              alignItems: "center",
              justifyContent: "flex-end"
            }}
          >
            <div
              style={{
                fontSize: "0.74rem",
                padding: "4px 9px",
                borderRadius: 999,
                border: "1px solid rgba(148,163,184,0.6)",
                background: "rgba(15,23,42,0.97)",
                color: "#9ca3af"
              }}
            >
              Hackathon prototype
            </div>
            <div
              style={{
                fontSize: "0.74rem",
                padding: "4px 9px",
                borderRadius: 999,
                border: "1px solid rgba(79,70,229,0.9)",
                background: "rgba(31,41,55,0.98)",
                color: "#e5e7eb"
              }}
            >
              Smart hashtag generation · Audience-aware
            </div>
          </div>
        </header>

        <main
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1.1fr)",
            gap: 16
          }}
        >
          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10,
              paddingRight: 6
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                color: "#9ca3af",
                textTransform: "uppercase",
                letterSpacing: "0.1em"
              }}
            >
              pipeline
            </div>
            <h1
              style={{
                fontSize: "1.9rem",
                fontWeight: 650,
                lineHeight: 1.1
              }}
            >
              Turn short notes into{" "}
              <span style={{ color: "#4f46e5" }}>
                engaging social media posts
              </span>
            </h1>
            <p
              style={{
                fontSize: "0.95rem",
                color: "#9ca3af",
                maxWidth: "32rem"
              }}
            >
              Enter a short description like "I went to Dubai, explored fancy big towers, Audience: Relatives" 
              and get a complete Instagram or LinkedIn post with relevant hashtags, expanded descriptions, 
              and audience-appropriate tone.
            </p>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, minmax(0,1fr))",
                gap: 8
              }}
            >
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: "1px solid rgba(51,65,85,0.9)",
                  fontSize: "0.78rem",
                  color: "#9ca3af"
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#4f46e5",
                    marginBottom: 2
                  }}
                >
                  step 1
                </div>
                Enter short note with location, activities, and audience.
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: "1px solid rgba(51,65,85,0.9)",
                  fontSize: "0.78rem",
                  color: "#9ca3af"
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#4f46e5",
                    marginBottom: 2
                  }}
                >
                  step 2
                </div>
                AI expands content and generates relevant hashtags.
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 12,
                  padding: "8px 10px",
                  border: "1px solid rgba(51,65,85,0.9)",
                  fontSize: "0.78rem",
                  color: "#9ca3af"
                }}
              >
                <div
                  style={{
                    fontSize: "0.7rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#4f46e5",
                    marginBottom: 2
                  }}
                >
                  step 3
                </div>
                Get ready-to-post content with audience-appropriate tone.
              </div>
            </div>
            {parsedInput && (
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 12,
                  padding: "10px 12px",
                  border: "1px solid rgba(79,70,229,0.5)",
                  fontSize: "0.8rem",
                  color: "#e5e7eb"
                }}
              >
                <div style={{ fontSize: "0.7rem", color: "#9ca3af", marginBottom: 4 }}>
                  Parsed Input:
                </div>
                <div>Location: {parsedInput.location || "Not detected"}</div>
                <div>Activities: {parsedInput.activities.join(", ") || "Not detected"}</div>
                <div>People: {parsedInput.people && parsedInput.people.length > 0 ? parsedInput.people.join(", ") : "Not detected"}</div>
                <div>Audience: {parsedInput.audience}</div>
              </div>
            )}
          </section>

          <section
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 10
            }}
          >
            <div
              style={{
                background: "#020617",
                borderRadius: 16,
                border: "1px solid rgba(51,65,85,0.9)",
                padding: 12,
                boxShadow: "0 16px 40px rgba(15,23,42,0.9)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 10
                }}
              >
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Generate post
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>
                    Smart expansion + hashtag generation
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(15,23,42,0.96)",
                    border: "1px solid rgba(148,163,184,0.7)",
                    color: "#9ca3af"
                  }}
                >
                  {activeAuthorChip}
                </div>
              </div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(0,1.1fr) minmax(0,0.9fr)",
                  gap: 8
                }}
              >
                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      fontSize: "0.78rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#9ca3af",
                      marginBottom: 4,
                      display: "block"
                    }}
                  >
                    Author
                  </label>
                  <select
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                    aria-label="Select author"
                    title="Select author"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      background: "#020617",
                      border: "1px solid rgba(55,65,81,0.9)",
                      color: "#e5e7eb",
                      fontSize: "0.85rem"
                    }}
                  >
                    {authors.length === 0 && (
                      <option value="">No authors</option>
                    )}
                    {authors.map((a) => (
                      <option key={a.author_id} value={a.author_id}>
                        {a.author_id}
                      </option>
                    ))}
                  </select>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: "#9ca3af",
                      marginTop: 3
                    }}
                  >
                    Based on local dataset
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label
                    style={{
                      fontSize: "0.78rem",
                      textTransform: "uppercase",
                      letterSpacing: "0.1em",
                      color: "#9ca3af",
                      marginBottom: 4,
                      display: "block"
                    }}
                  >
                    Social network
                  </label>
                  <select
                    value={socialNetwork}
                    onChange={(e) => setSocialNetwork(e.target.value)}
                    aria-label="Select social network"
                    title="Select social network"
                    style={{
                      width: "100%",
                      padding: "6px 8px",
                      borderRadius: 8,
                      background: "#020617",
                      border: "1px solid rgba(55,65,81,0.9)",
                      color: "#e5e7eb",
                      fontSize: "0.85rem"
                    }}
                  >
                    <option value="instagram">Instagram</option>
                    <option value="linkedin">LinkedIn</option>
                    <option value="telegram">Telegram</option>
                  </select>
                  <div
                    style={{
                      fontSize: "0.72rem",
                      color: "#9ca3af",
                      marginTop: 3
                    }}
                  >
                    Format & hashtag count
                  </div>
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <label
                  style={{
                    fontSize: "0.78rem",
                    textTransform: "uppercase",
                    letterSpacing: "0.1em",
                    color: "#9ca3af",
                    marginBottom: 4,
                    display: "block"
                  }}
                >
                  Short Note (with Audience)
                </label>
                <textarea
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder='Example: "I went to Dubai, explored fancy big towers, Audience: Relatives"'
                  style={{
                    width: "100%",
                    minHeight: 80,
                    padding: "6px 8px",
                    borderRadius: 8,
                    background: "#020617",
                    border: "1px solid rgba(55,65,81,0.9)",
                    color: "#e5e7eb",
                    fontSize: "0.85rem",
                    resize: "vertical"
                  }}
                />
                <div
                  style={{
                    fontSize: "0.72rem",
                    color: "#9ca3af",
                    marginTop: 3
                  }}
                >
                  Format: "Activity, location, Audience: [Relatives/Friends/Professional]"
                </div>
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                  margin: "4px 0 6px"
                }}
              >
                <button
                  onClick={handleGenerate}
                  style={{
                    background:
                      "linear-gradient(135deg, #4f46e5, #4338ca)",
                    color: "#f9fafb",
                    borderRadius: 999,
                    border: "1px solid rgba(129,140,248,0.7)",
                    fontSize: "0.85rem",
                    padding: "7px 13px",
                    cursor: "pointer",
                    boxShadow: "0 10px 22px rgba(79,70,229,0.55)"
                  }}
                >
                  ⚡ Generate post
                </button>
                <div
                  style={{
                    fontSize: "0.76rem",
                    color:
                      status.startsWith("Generation") ||
                      status.startsWith("Style")
                        ? "#4ade80"
                        : status.startsWith("Error") ||
                          status.includes("Select") ||
                          status.includes("Enter")
                        ? "#f97373"
                        : "#9ca3af"
                  }}
                >
                  {status}
                </div>
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 12,
                  border: "1px solid rgba(51,65,85,0.95)",
                  padding: "9px 10px",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: "0.8rem",
                  whiteSpace: "pre-wrap",
                  maxHeight: 300,
                  overflow: "auto"
                }}
              >
                {generated}
              </div>
            </div>

            <div
              style={{
                background: "#020617",
                borderRadius: 16,
                border: "1px solid rgba(51,65,85,0.9)",
                padding: 12,
                boxShadow: "0 16px 40px rgba(15,23,42,0.9)"
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 8,
                  gap: 10
                }}
              >
                <div>
                  <div style={{ fontSize: "0.95rem", fontWeight: 600 }}>
                    Author style profile
                  </div>
                  <div style={{ fontSize: "0.76rem", color: "#9ca3af" }}>
                    Speech patterns and tokens
                  </div>
                </div>
                <div
                  style={{
                    fontSize: "0.7rem",
                    padding: "3px 8px",
                    borderRadius: 999,
                    background: "rgba(15,23,42,0.96)",
                    border: "1px solid rgba(148,163,184,0.7)",
                    color: "#9ca3af"
                  }}
                >
                  {styleChip}
                </div>
              </div>
              <div style={{ marginBottom: 8 }}>
                <button
                  onClick={handleAnalyzeStyle}
                  style={{
                    background: "rgba(15,23,42,0.98)",
                    borderRadius: 999,
                    border: "1px solid rgba(148,163,184,0.7)",
                    color: "#9ca3af",
                    fontSize: "0.85rem",
                    padding: "7px 13px",
                    cursor: "pointer"
                  }}
                >
                  Analyze style
                </button>
              </div>
              <div
                style={{
                  background: "rgba(15,23,42,0.98)",
                  borderRadius: 10,
                  border: "1px solid rgba(51,65,85,0.95)",
                  padding: "7px 9px",
                  fontFamily:
                    'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace',
                  fontSize: "0.78rem",
                  whiteSpace: "pre-wrap",
                  maxHeight: 190,
                  overflow: "auto"
                }}
              >
                {styleInfo}
              </div>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                  marginTop: 6
                }}
              >
                {traits.map((tr) => (
                  <div
                    key={tr}
                    style={{
                      fontSize: "0.7rem",
                      padding: "3px 8px",
                      borderRadius: 999,
                      border: "1px solid rgba(129,140,248,0.7)",
                      background: "rgba(15,23,42,0.98)",
                      color: "#e5e7eb"
                    }}
                  >
                    {tr}
                  </div>
                ))}
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
};

export default App;