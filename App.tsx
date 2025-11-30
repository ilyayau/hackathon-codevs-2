import React, { useEffect, useMemo, useState } from "react";
import { authorsData } from "./authorsData";
import { SocialMediaSection } from "./src/components/SocialMediaSection";

type Author = {
  author_id: string;
  social_network: string;
  sample_posts: string[];
};

type StyleFeatures = {
  avg_words: number;
  emojis_per_post: number;
  hashtags_per_post: number;
  exclam_per_post: number;
  quest_per_post: number;
  favorite_tokens: string[];
};

type StyleTraits = string[];

type ParsedInput = {
  content: string;
  location?: string;
  activities: string[];
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

function humanizeText(text: string): string {
  let h = text;
  h = h.replace(/—/g, ",");
  h = h.replace(/\*\*/g, "");
  h = h.replace(/\*/g, "");
  h = h.replace(/#{1,6}\s/g, "");
  h = h.replace(/;/g, ".");
  const banned: [RegExp, string][] = [
    [/\butilize\b/gi, "use"],
    [/\butilizing\b/gi, "using"],
    [/\bcan\b/gi, "will"],
    [/\bdelve\b/gi, "explore"],
    [/\bembark\b/gi, "start"],
    [/\bgame-changer\b/gi, "major change"],
    [/\bunlock\b/gi, "access"],
    [/\bdiscover\b/gi, "find"],
    [/\brevolutionize\b/gi, "change"],
    [/\bdisruptive\b/gi, "new"],
    [/\bdive deep\b/gi, "examine"],
    [/\btapestry\b/gi, "mix"],
    [/\billuminate\b/gi, "show"],
    [/\bunveil\b/gi, "reveal"],
    [/\bpivotal\b/gi, "key"],
    [/\bintricate\b/gi, "complex"],
    [/\belucidate\b/gi, "explain"],
    [/\bharness\b/gi, "use"],
    [/\bgroundbreaking\b/gi, "new"],
    [/\bcutting-edge\b/gi, "modern"],
    [/\bremarkable\b/gi, "notable"],
    [/\bboost\b/gi, "increase"],
    [/\bpowerful\b/gi, "strong"],
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
  h = h.replace(/remains to be seen\b/gi, "is unclear");
  const fillers = [
    "very",
    "really",
    "literally",
    "actually",
    "certainly",
    "probably",
    "basically"
  ];
  for (const w of fillers) {
    const re = new RegExp("\\b" + w + "\\s+", "gi");
    h = h.replace(re, "");
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

// ===== NEW: Parse input format =====
function parseInput(input: string): ParsedInput {
  const audienceMatch = input.match(/Audience:\s*([^,]+)/i);
  const audience = audienceMatch ? audienceMatch[1].trim() : "General";
  
  let content = input.replace(/Audience:\s*[^,]+/i, "").trim();
  content = content.replace(/,\s*$/, "").trim();
  
  // Extract location (capitalized words, common place names)
  const locationMatch = content.match(/\b(Dubai|Paris|London|Tokyo|New York|Moscow|Berlin|Rome|Barcelona|Amsterdam|Vienna|Prague|Bangkok|Singapore|Sydney|Melbourne|Toronto|Vancouver|Los Angeles|San Francisco|Miami|Las Vegas|Bali|Maldives|Santorini|Istanbul|Cairo|Marrakech|Madrid|Lisbon|Stockholm|Oslo|Copenhagen|Helsinki|Warsaw|Krakow|Budapest|Athens|Zurich|Geneva|Monaco|Monte Carlo|Venice|Florence|Milan|Naples|Porto|Seville|Granada|Valencia|Ibiza|Mykonos|Crete|Rhodes)\b/i);
  const location = locationMatch ? locationMatch[1] : undefined;
  
  // Extract activities (verbs + objects)
  const activities: string[] = [];
  const activityPatterns = [
    /(explored|visited|saw|discovered|experienced|enjoyed|tried|tasted|walked|hiked|drove|flew|stayed|relaxed|shopped|danced|partied|swam|surfed|skied|climbed|photographed|admired|appreciated)\s+([^,]+?)(?=,|$)/gi,
    /(went to|traveled to|flew to|drove to)\s+([^,]+?)(?=,|$)/gi
  ];
  
  for (const pattern of activityPatterns) {
    let match;
    // Reset regex lastIndex to avoid issues with multiple calls
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const activity = match[0].trim();
      if (activity && !activities.includes(activity) && !activity.toLowerCase().includes('audience')) {
        activities.push(activity);
      }
    }
  }
  
  // If no activities found, try to extract key phrases (excluding location and audience)
  if (activities.length === 0) {
    let phrases = content.split(',').map(p => p.trim()).filter(p => {
      const lower = p.toLowerCase();
      if (p.length === 0 || lower.includes('audience')) return false;
      if (locationMatch && locationMatch[1] && lower.includes(locationMatch[1].toLowerCase())) return false;
      return true;
    });
    activities.push(...phrases.slice(0, 3));
  }
  
  return { content, location, activities, audience };
}

// ===== NEW: Generate hashtags =====
function generateHashtags(parsed: ParsedInput, socialNetwork: string): string[] {
  const hashtags: string[] = [];
  const keywords: string[] = [];
  
  // Add location-based hashtags
  if (parsed.location) {
    const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
    hashtags.push(`#${loc}`, `#${loc}travel`, `#${loc}holiday`, `#visit${loc}`);
    keywords.push(parsed.location);
  }
  
  // Add activity-based hashtags
  for (const activity of parsed.activities) {
    const words = activity.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && /^[a-z]+$/.test(word)) {
        const cleanWord = word.replace(/ed$|ing$|s$/, '');
        if (cleanWord.length > 3) {
          hashtags.push(`#${cleanWord}`);
          keywords.push(word);
        }
      }
    }
  }
  
  // Add seasonal/travel hashtags
  const month = new Date().getMonth();
  const season = month >= 2 && month <= 4 ? 'spring' : 
                 month >= 5 && month <= 7 ? 'summer' : 
                 month >= 8 && month <= 10 ? 'autumn' : 'winter';
  hashtags.push(`#${season}vacation`, `#${season}travel`, `#${season}holiday`);
  
  // Add general travel hashtags
  hashtags.push('#travel', '#wanderlust', '#explore', '#adventure', '#vacation', '#holiday');
  
  // Add audience-specific hashtags
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    hashtags.push('#familytime', '#familyvacation', '#familytrip');
  } else if (parsed.audience.toLowerCase().includes('friend')) {
    hashtags.push('#friends', '#friendstrip', '#travelwithfriends');
  } else if (parsed.audience.toLowerCase().includes('professional') || parsed.audience.toLowerCase().includes('colleague')) {
    hashtags.push('#businesstrip', '#professional', '#networking');
  }
  
  // Remove duplicates and limit count
  const unique = Array.from(new Set(hashtags));
  const maxHashtags = socialNetwork.toLowerCase() === 'instagram' ? 15 : 5;
  return unique.slice(0, maxHashtags);
}

// ===== NEW: Expand short input into longer description =====
function expandInput(parsed: ParsedInput, authorStyle: StyleFeatures): string {
  const parts: string[] = [];
  
  // Opening based on audience
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    parts.push("Just wanted to share an amazing experience with you all!");
  } else if (parsed.audience.toLowerCase().includes('professional') || parsed.audience.toLowerCase().includes('colleague')) {
    parts.push("Excited to share a recent experience that I believe will be of interest.");
  } else {
    parts.push("Had an incredible experience recently!");
  }
  
  // Location introduction
  if (parsed.location) {
    parts.push(`I recently visited ${parsed.location}, and it was absolutely breathtaking.`);
  }
  
  // Activities expansion
  if (parsed.activities.length > 0) {
    // Clean up activities - remove "I went to" if location is already mentioned
    let cleanActivities = parsed.activities.map(a => {
      let cleaned = a.trim();
      // Remove redundant "went to [location]" if location is already mentioned
      if (parsed.location && cleaned.toLowerCase().includes(`went to ${parsed.location.toLowerCase()}`)) {
        return null;
      }
      // Remove "I" prefix if present
      cleaned = cleaned.replace(/^I\s+/i, '');
      return cleaned;
    }).filter(a => a !== null && a.length > 0) as string[];
    
    if (cleanActivities.length > 0) {
      const activityText = cleanActivities.length === 1 
        ? cleanActivities[0]
        : cleanActivities.slice(0, -1).join(', ') + ' and ' + cleanActivities[cleanActivities.length - 1];
      parts.push(`During my time there, I ${activityText}.`);
      
      // Add descriptive elements
      if (cleanActivities.some(a => a.toLowerCase().includes('explore') || a.toLowerCase().includes('visit'))) {
        parts.push("The experience was truly memorable and left me with so many amazing memories.");
      }
      if (cleanActivities.some(a => a.toLowerCase().includes('tower') || a.toLowerCase().includes('building'))) {
        parts.push("The architecture was stunning, and the views were absolutely spectacular.");
      }
    }
  }
  
  // Closing based on audience
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    parts.push("Can't wait to show you all the photos and tell you more about it!");
  } else if (parsed.audience.toLowerCase().includes('professional')) {
    parts.push("Looking forward to connecting and sharing more insights.");
  } else {
    parts.push("Highly recommend checking it out if you get the chance!");
  }
  
  return parts.join(' ');
}

// ===== NEW: Adjust tone based on audience =====
function adjustToneForAudience(text: string, audience: string): string {
  let adjusted = text;
  const aud = audience.toLowerCase();
  
  if (aud.includes('professional') || aud.includes('colleague') || aud.includes('linkedin')) {
    // More formal, professional tone
    adjusted = adjusted.replace(/\bcan't\b/gi, "cannot");
    adjusted = adjusted.replace(/\bwon't\b/gi, "will not");
    adjusted = adjusted.replace(/\bdidn't\b/gi, "did not");
    adjusted = adjusted.replace(/\bawesome\b/gi, "impressive");
    adjusted = adjusted.replace(/\bcool\b/gi, "notable");
    adjusted = adjusted.replace(/\bamazing\b/gi, "remarkable");
  } else if (aud.includes('relative') || aud.includes('family') || aud.includes('friend')) {
    // More casual, personal tone
    adjusted = adjusted.replace(/\bremarkable\b/gi, "amazing");
    adjusted = adjusted.replace(/\bimpressive\b/gi, "awesome");
    adjusted = adjusted.replace(/\bnotable\b/gi, "cool");
  }
  
  return adjusted;
}

function templateFromTopicAndTokens(topic: string, fav: string[]): string {
  const cleanTopic =
    topic.trim().charAt(0).toUpperCase() + topic.trim().slice(1);
  const keyWords = fav.slice(0, 6).join(", ");
  return (
    cleanTopic +
    ". " +
    "Этот текст написан в стиле автора и опирается на его типичные темы: " +
    keyWords +
    "."
  );
}

function extractStyleFeatures(posts: string[]): StyleFeatures {
  let n = posts.length;
  if (!n) {
    return {
      avg_words: 0,
      emojis_per_post: 0,
      hashtags_per_post: 0,
      exclam_per_post: 0,
      quest_per_post: 0,
      favorite_tokens: []
    };
  }
  let emojis = 0;
  let hashtags = 0;
  let exclam = 0;
  let quest = 0;
  let allTokens: string[] = [];
  let wordsPerPost: number[] = [];
  const emojiRe = /[\u{1F300}-\u{1FAFF}]/gu;
  for (const p of posts) {
    const toks = tokenize(p);
    allTokens = allTokens.concat(toks);
    const words = toks.filter((t) => /\w/.test(t));
    wordsPerPost.push(words.length);
    const emojiMatches = p.match(emojiRe);
    emojis += emojiMatches ? emojiMatches.length : 0;
    hashtags += toks.filter((t) => t.startsWith("#")).length;
    exclam += (p.match(/!/g) || []).length;
    quest += (p.match(/\?/g) || []).length;
  }
  const avgWords =
    wordsPerPost.reduce((a, b) => a + b, 0) / (wordsPerPost.length || 1);
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
  // Support any Unicode letter (works with all languages: English, Russian, Arabic, Chinese, Japanese, etc.)
  const fav = top.filter((w) => /^\p{L}{4,}$/u.test(w)).slice(0, 10);
  return {
    avg_words: avgWords,
    emojis_per_post: emojisPerPost,
    hashtags_per_post: hashtagsPerPost,
    exclam_per_post: exclamPerPost,
    quest_per_post: questPerPost,
    favorite_tokens: fav
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
  const [traits, setTraits] = useState<StyleTraits[]>([]);
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
      avg_words: feats.avg_words,
      emojis_per_post: feats.emojis_per_post,
      hashtags_per_post: feats.hashtags_per_post,
      exclam_per_post: feats.exclam_per_post,
      quest_per_post: feats.quest_per_post,
      favorite_tokens: feats.favorite_tokens
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

    // Parse input
    const parsed = parseInput(t);
    setParsedInput(parsed);

    // Get author style
    const feats = extractStyleFeatures(currentAuthor.sample_posts);
    
    // Expand the short input into longer description
    let expandedText = expandInput(parsed, feats);
    
    // Try to enhance with Markov chain if we have enough data
    const chain = buildMarkov(currentAuthor.sample_posts, 2);
    if (chain.size > 0) {
      const topicTokens = tokenize(expandedText).filter((x) => /\w/.test(x));
      const maxTokens = socialNetwork.toLowerCase() === "instagram" ? 250 : 300;
      
      // Generate additional content using Markov
      const markovText = generateFromMarkov(chain, 2, maxTokens, topicTokens);
      if (markovText && !isGibberish(markovText)) {
        // Blend expanded text with Markov-generated content
        expandedText = expandedText + " " + markovText;
      }
    }
    
    // Humanize the text
    let finalText = humanizeText(expandedText);
    finalText = cutToFullSentence(finalText);
    
    // Adjust tone for audience
    finalText = adjustToneForAudience(finalText, parsed.audience);
    
    // If still too short or gibberish, use template
    if (!finalText || isGibberish(finalText) || finalText.split(' ').length < 20) {
      finalText = expandInput(parsed, feats);
      finalText = adjustToneForAudience(finalText, parsed.audience);
    }
    
    // Generate hashtags
    const hashtags = generateHashtags(parsed, socialNetwork);
    const hashtagString = hashtags.join(' ');
    
    // Combine final text with hashtags
    const finalPost = finalText + (hashtagString ? '\n\n' + hashtagString : '');
    
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