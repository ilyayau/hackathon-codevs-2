// ===== Core Functions =====

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
    if (/[\.!\?]/.test(next) && tokens.length > Math.max(40, maxTokens * 0.8))
      break;
  }
  return detokenize(tokens);
}

function humanizeText(text) {
  let h = text;
  h = h.replace(/—/g, ",");
  h = h.replace(/\*\*/g, "");
  h = h.replace(/\*/g, "");
  h = h.replace(/#{1,6}\s/g, "");
  h = h.replace(/;/g, ".");
  const banned = [
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
  const transitions = [
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
  const fillers = ["very", "really", "literally", "actually", "certainly", "probably", "basically"];
  for (const w of fillers) {
    const re = new RegExp("\\b" + w + "\\s+", "gi");
    h = h.replace(re, "");
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
  if (tokens.length < 15) return false;
  const single = tokens.filter((t) => /^\p{L}$/u.test(t)).length;
  const longWords = tokens.filter((t) => /^\p{L}{4,}$/u.test(t)).length;
  const ratioSingle = single / tokens.length;
  const ratioLong = longWords / tokens.length;
  return ratioSingle > 0.45 && ratioLong < 0.25;
}

function parseInput(input) {
  const audienceMatch = input.match(/Audience:\s*([^,]+)/i);
  const audience = audienceMatch ? audienceMatch[1].trim() : "General";
  
  let content = input.replace(/Audience:\s*[^,]+/i, "").trim();
  content = content.replace(/,\s*$/, "").trim();
  
  const locationMatch = content.match(/\b(Dubai|Paris|London|Tokyo|New York|Moscow|Berlin|Rome|Barcelona|Amsterdam|Vienna|Prague|Bangkok|Singapore|Sydney|Melbourne|Toronto|Vancouver|Los Angeles|San Francisco|Miami|Las Vegas|Bali|Maldives|Santorini|Istanbul|Cairo|Marrakech|Madrid|Lisbon|Stockholm|Oslo|Copenhagen|Helsinki|Warsaw|Krakow|Budapest|Athens|Zurich|Geneva|Monaco|Monte Carlo|Venice|Florence|Milan|Naples|Porto|Seville|Granada|Valencia|Ibiza|Mykonos|Crete|Rhodes)\b/i);
  const location = locationMatch ? locationMatch[1] : undefined;
  
  // Extract people/names (met, saw, met with, hung out with, etc.)
  const people = [];
  const peoplePatterns = [
    /(met|met with|saw|caught up with|hung out with|spent time with|reunited with|visited with|had dinner with|had lunch with|had coffee with)\s+([^,]+?)(?=,|$)/gi,
    /(met|saw)\s+(my|an|a|the)\s+(friend|friends|colleague|colleagues|family|relative|relatives|cousin|cousins|brother|sister|parent|parents|uncle|aunt|grandparent|grandparents)\s+([^,]+?)(?=,|$)/gi
  ];
  
  for (const pattern of peoplePatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      let personText = match[0].trim();
      // Extract names from "met John and Sarah" or "met John, Sarah, and Mike"
      const namesMatch = personText.match(/(?:met|met with|saw|caught up with|hung out with|spent time with|reunited with|visited with|had dinner with|had lunch with|had coffee with)\s+(.+)/i);
      if (namesMatch) {
        let names = namesMatch[1].trim();
        // Split by "and" or comma
        names = names.replace(/\s+and\s+/gi, ', ').split(',').map(n => n.trim()).filter(n => n.length > 0);
        // Filter out common words that aren't names
        names = names.filter(name => {
          const lower = name.toLowerCase();
          return !lower.match(/^(my|an|a|the|friend|friends|colleague|colleagues|family|relative|relatives)$/);
        });
        if (names.length > 0) {
          people.push(...names);
        }
      }
    }
  }
  
  // Also try to extract capitalized words that might be names (after "met", "saw", etc.)
  const namePattern = /\b(met|saw|met with)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*(?:\s+and\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)*)/gi;
  let nameMatch;
  namePattern.lastIndex = 0;
  while ((nameMatch = namePattern.exec(content)) !== null) {
    let namesStr = nameMatch[2];
    // Split by "and" or comma
    let extractedNames = namesStr.replace(/\s+and\s+/gi, ', ').split(',').map(n => n.trim());
    extractedNames = extractedNames.filter(name => {
      // Check if it looks like a name (starts with capital, 2+ letters, not a location)
      return name.length >= 2 && /^[A-Z]/.test(name) && 
             !locationMatch || !name.toLowerCase().includes(locationMatch[1].toLowerCase());
    });
    if (extractedNames.length > 0) {
      people.push(...extractedNames);
    }
  }
  
  // Remove duplicates and clean up
  const uniquePeople = Array.from(new Set(people.map(p => p.trim()).filter(p => p.length > 0)));
  
  const activities = [];
  const activityPatterns = [
    /(explored|visited|saw|discovered|experienced|enjoyed|tried|tasted|walked|hiked|drove|flew|stayed|relaxed|shopped|danced|partied|swam|surfed|skied|climbed|photographed|admired|appreciated)\s+([^,]+?)(?=,|$)/gi,
    /(went to|traveled to|flew to|drove to)\s+([^,]+?)(?=,|$)/gi
  ];
  
  for (const pattern of activityPatterns) {
    let match;
    pattern.lastIndex = 0;
    while ((match = pattern.exec(content)) !== null) {
      const activity = match[0].trim();
      // Don't include activities that are actually about meeting people
      if (activity && !activities.includes(activity) && 
          !activity.toLowerCase().includes('audience') &&
          !activity.toLowerCase().match(/^(met|saw|met with|caught up with|hung out with)/)) {
        activities.push(activity);
      }
    }
  }
  
  if (activities.length === 0) {
    let phrases = content.split(',').map(p => p.trim()).filter(p => {
      const lower = p.toLowerCase();
      if (p.length === 0 || lower.includes('audience')) return false;
      if (locationMatch && locationMatch[1] && lower.includes(locationMatch[1].toLowerCase())) return false;
      // Don't include phrases about meeting people
      if (lower.match(/^(met|saw|met with|caught up with|hung out with)/)) return false;
      return true;
    });
    activities.push(...phrases.slice(0, 3));
  }
  
  return { content, location, activities, people: uniquePeople, audience };
}

function generateHashtags(parsed, socialNetwork) {
  const hashtags = [];
  
  if (parsed.location) {
    const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
    hashtags.push(`#${loc}`, `#${loc}travel`, `#${loc}holiday`, `#visit${loc}`);
  }
  
  for (const activity of parsed.activities) {
    const words = activity.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 3 && /^[a-z]+$/.test(word)) {
        const cleanWord = word.replace(/ed$|ing$|s$/, '');
        if (cleanWord.length > 3) {
          hashtags.push(`#${cleanWord}`);
        }
      }
    }
  }
  
  const month = new Date().getMonth();
  const season = month >= 2 && month <= 4 ? 'spring' : 
                 month >= 5 && month <= 7 ? 'summer' : 
                 month >= 8 && month <= 10 ? 'autumn' : 'winter';
  hashtags.push(`#${season}vacation`, `#${season}travel`, `#${season}holiday`);
  hashtags.push('#travel', '#wanderlust', '#explore', '#adventure', '#vacation', '#holiday');
  
  // Add people-related hashtags
  if (parsed.people && parsed.people.length > 0) {
    hashtags.push('#meetup', '#friends', '#connections');
    if (parsed.people.length > 1) {
      hashtags.push('#group');
    }
  }
  
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    hashtags.push('#familytime', '#familyvacation', '#familytrip');
  } else if (parsed.audience.toLowerCase().includes('friend')) {
    hashtags.push('#friends', '#friendstrip', '#travelwithfriends');
  } else if (parsed.audience.toLowerCase().includes('professional') || parsed.audience.toLowerCase().includes('colleague')) {
    hashtags.push('#businesstrip', '#professional', '#networking');
  }
  
  const unique = Array.from(new Set(hashtags));
  const maxHashtags = socialNetwork.toLowerCase() === 'instagram' ? 15 : 5;
  return unique.slice(0, maxHashtags);
}

function expandInput(parsed, authorStyle) {
  const parts = [];
  
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    parts.push("Just wanted to share an amazing experience with you all!");
  } else if (parsed.audience.toLowerCase().includes('professional') || parsed.audience.toLowerCase().includes('colleague')) {
    parts.push("Excited to share a recent experience that I believe will be of interest.");
  } else {
    parts.push("Had an incredible experience recently!");
  }
  
  if (parsed.location) {
    parts.push(`I recently visited ${parsed.location}, and it was absolutely breathtaking.`);
  }
  
  // Include information about people met
  if (parsed.people && parsed.people.length > 0) {
    const peopleText = parsed.people.length === 1 
      ? parsed.people[0]
      : parsed.people.slice(0, -1).join(', ') + ' and ' + parsed.people[parsed.people.length - 1];
    
    if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
      parts.push(`I also had the chance to meet up with ${peopleText}, which made the experience even more special!`);
    } else if (parsed.audience.toLowerCase().includes('professional') || parsed.audience.toLowerCase().includes('colleague')) {
      parts.push(`I had the opportunity to connect with ${peopleText}, which led to some great discussions.`);
    } else {
      parts.push(`I also met ${peopleText}, which was wonderful!`);
    }
  }
  
  if (parsed.activities.length > 0) {
    let cleanActivities = parsed.activities.map(a => {
      let cleaned = a.trim();
      if (parsed.location && cleaned.toLowerCase().includes(`went to ${parsed.location.toLowerCase()}`)) {
        return null;
      }
      cleaned = cleaned.replace(/^I\s+/i, '');
      return cleaned;
    }).filter(a => a !== null && a.length > 0);
    
    if (cleanActivities.length > 0) {
      const activityText = cleanActivities.length === 1 
        ? cleanActivities[0]
        : cleanActivities.slice(0, -1).join(', ') + ' and ' + cleanActivities[cleanActivities.length - 1];
      parts.push(`During my time there, I ${activityText}.`);
      
      if (cleanActivities.some(a => a.toLowerCase().includes('explore') || a.toLowerCase().includes('visit'))) {
        parts.push("The experience was truly memorable and left me with so many amazing memories.");
      }
      if (cleanActivities.some(a => a.toLowerCase().includes('tower') || a.toLowerCase().includes('building'))) {
        parts.push("The architecture was stunning, and the views were absolutely spectacular.");
      }
    }
  }
  
  if (parsed.audience.toLowerCase().includes('relative') || parsed.audience.toLowerCase().includes('family')) {
    if (parsed.people && parsed.people.length > 0) {
      parts.push("Can't wait to show you all the photos and tell you more about it and the amazing people I met!");
    } else {
      parts.push("Can't wait to show you all the photos and tell you more about it!");
    }
  } else if (parsed.audience.toLowerCase().includes('professional')) {
    parts.push("Looking forward to connecting and sharing more insights.");
  } else {
    parts.push("Highly recommend checking it out if you get the chance!");
  }
  
  return parts.join(' ');
}

function adjustToneForAudience(text, audience) {
  let adjusted = text;
  const aud = audience.toLowerCase();
  
  if (aud.includes('professional') || aud.includes('colleague') || aud.includes('linkedin')) {
    adjusted = adjusted.replace(/\bcan't\b/gi, "cannot");
    adjusted = adjusted.replace(/\bwon't\b/gi, "will not");
    adjusted = adjusted.replace(/\bdidn't\b/gi, "did not");
    adjusted = adjusted.replace(/\bawesome\b/gi, "impressive");
    adjusted = adjusted.replace(/\bcool\b/gi, "notable");
    adjusted = adjusted.replace(/\bamazing\b/gi, "remarkable");
  } else if (aud.includes('relative') || aud.includes('family') || aud.includes('friend')) {
    adjusted = adjusted.replace(/\bremarkable\b/gi, "amazing");
    adjusted = adjusted.replace(/\bimpressive\b/gi, "awesome");
    adjusted = adjusted.replace(/\bnotable\b/gi, "cool");
  }
  
  return adjusted;
}

function extractStyleFeatures(posts) {
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
  let allTokens = [];
  let wordsPerPost = [];
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
  const avgWords = wordsPerPost.reduce((a, b) => a + b, 0) / (wordsPerPost.length || 1);
  const emojisPerPost = emojis / n;
  const hashtagsPerPost = hashtags / n;
  const exclamPerPost = exclam / n;
  const questPerPost = quest / n;
  const freq = new Map();
  for (const t of allTokens) {
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
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
  return t;
}

// ===== App State =====
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

// ===== DOM Elements =====
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
  parsedAudience: null
};

// ===== Initialize =====
function init() {
  // Get DOM elements
  elements.authorSelect = document.getElementById('authorSelect');
  elements.socialNetworkSelect = document.getElementById('socialNetworkSelect');
  elements.topicInput = document.getElementById('topicInput');
  elements.generateBtn = document.getElementById('generateBtn');
  elements.analyzeBtn = document.getElementById('analyzeBtn');
  elements.status = document.getElementById('status');
  elements.generatedOutput = document.getElementById('generatedOutput');
  elements.styleInfo = document.getElementById('styleInfo');
  elements.traits = document.getElementById('traits');
  elements.activeAuthorChip = document.getElementById('activeAuthorChip');
  elements.styleChip = document.getElementById('styleChip');
  elements.parsedInput = document.getElementById('parsedInput');
  elements.parsedLocation = document.getElementById('parsedLocation');
  elements.parsedActivities = document.getElementById('parsedActivities');
  elements.parsedPeople = document.getElementById('parsedPeople');
  elements.parsedAudience = document.getElementById('parsedAudience');
  
  // Initialize authors
  state.authors = authorsData;
  if (state.authors.length > 0) {
    state.selectedId = state.authors[0].author_id;
    state.activeAuthorChip = state.authors[0].author_id;
    state.status = "Ready";
  } else {
    state.status = "No authors";
  }
  
  // Populate author select
  elements.authorSelect.innerHTML = state.authors.length === 0 
    ? '<option value="">No authors</option>'
    : state.authors.map(a => `<option value="${a.author_id}">${a.author_id}</option>`).join('');
  elements.authorSelect.value = state.selectedId;
  
  // Set initial topic
  elements.topicInput.value = state.topic;
  
  // Event listeners
  elements.authorSelect.addEventListener('change', (e) => {
    state.selectedId = e.target.value;
    updateActiveAuthorChip();
  });
  
  elements.socialNetworkSelect.addEventListener('change', (e) => {
    state.socialNetwork = e.target.value;
  });
  
  elements.topicInput.addEventListener('input', (e) => {
    state.topic = e.target.value;
  });
  
  elements.generateBtn.addEventListener('click', handleGenerate);
  elements.analyzeBtn.addEventListener('click', handleAnalyzeStyle);
  
  // Update UI
  updateUI();
  renderSocialMediaSection();
}

function updateUI() {
  elements.status.textContent = state.status;
  elements.generatedOutput.textContent = state.generated;
  elements.styleInfo.textContent = state.styleInfo;
  elements.activeAuthorChip.textContent = state.activeAuthorChip;
  elements.styleChip.textContent = state.styleChip;
  
  // Update status color
  if (state.status.startsWith("Generation") || state.status.startsWith("Style")) {
    elements.status.className = "status success";
  } else if (state.status.startsWith("Error") || state.status.includes("Select") || state.status.includes("Enter")) {
    elements.status.className = "status error";
  } else {
    elements.status.className = "status";
  }
  
  // Update traits
  elements.traits.innerHTML = state.traits.map(tr => 
    `<div class="trait">${tr}</div>`
  ).join('');
  
  // Update parsed input
  if (state.parsedInput) {
    elements.parsedInput.style.display = 'block';
    elements.parsedLocation.textContent = `Location: ${state.parsedInput.location || "Not detected"}`;
    elements.parsedActivities.textContent = `Activities: ${state.parsedInput.activities.join(", ") || "Not detected"}`;
    elements.parsedPeople.textContent = `People met: ${state.parsedInput.people && state.parsedInput.people.length > 0 ? state.parsedInput.people.join(", ") : "Not detected"}`;
    elements.parsedAudience.textContent = `Audience: ${state.parsedInput.audience}`;
  } else {
    elements.parsedInput.style.display = 'none';
  }
}

function updateActiveAuthorChip() {
  const author = state.authors.find(a => a.author_id === state.selectedId);
  if (author) {
    state.activeAuthorChip = author.author_id;
    elements.activeAuthorChip.textContent = state.activeAuthorChip;
  }
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
    avg_words: feats.avg_words,
    emojis_per_post: feats.emojis_per_post,
    hashtags_per_post: feats.hashtags_per_post,
    exclam_per_post: feats.exclam_per_post,
    quest_per_post: feats.quest_per_post,
    favorite_tokens: feats.favorite_tokens
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
  
  const feats = extractStyleFeatures(currentAuthor.sample_posts);
  let expandedText = expandInput(parsed, feats);
  
  const chain = buildMarkov(currentAuthor.sample_posts, 2);
  if (chain.size > 0) {
    const topicTokens = tokenize(expandedText).filter((x) => /\w/.test(x));
    const maxTokens = state.socialNetwork.toLowerCase() === "instagram" ? 250 : 300;
    const markovText = generateFromMarkov(chain, 2, maxTokens, topicTokens);
    if (markovText && !isGibberish(markovText)) {
      expandedText = expandedText + " " + markovText;
    }
  }
  
  let finalText = humanizeText(expandedText);
  finalText = cutToFullSentence(finalText);
  finalText = adjustToneForAudience(finalText, parsed.audience);
  
  if (!finalText || isGibberish(finalText) || finalText.split(' ').length < 20) {
    finalText = expandInput(parsed, feats);
    finalText = adjustToneForAudience(finalText, parsed.audience);
  }
  
  const hashtags = generateHashtags(parsed, state.socialNetwork);
  const hashtagString = hashtags.join(' ');
  const finalPost = finalText + (hashtagString ? '\n\n' + hashtagString : '');
  
  state.generated = finalPost;
  state.status = "Generation done";
  updateUI();
}

function renderSocialMediaSection() {
  const socialLinks = [
    { name: 'Facebook', url: 'https://facebook.com', color: '#1877F2', icon: '📘' },
    { name: 'Twitter', url: 'https://twitter.com', color: '#1DA1F2', icon: '🐦' },
    { name: 'Instagram', url: 'https://instagram.com', color: '#E4405F', icon: '📷' },
    { name: 'LinkedIn', url: 'https://linkedin.com', color: '#0A66C2', icon: '💼' },
    { name: 'YouTube', url: 'https://youtube.com', color: '#FF0000', icon: '📺' },
    { name: 'Email', url: 'mailto:contact@codev-diffuzio.com', color: '#10a37f', icon: '✉️' }
  ];
  
  const section = document.getElementById('socialMediaSection');
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
        `).join('')}
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

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
