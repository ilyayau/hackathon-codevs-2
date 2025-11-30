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

// ===== Advanced Style Analysis =====

function detectLanguage(posts) {
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

function analyzeTonality(posts) {
  const allText = posts.join(" ").toLowerCase();
  
  // Formal vs informal indicators
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
  
  // Positive vs neutral indicators
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

function extractSentencePatterns(posts) {
  const patterns = {
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

function extractOpeningClosingPhrases(posts) {
  const openings = [];
  const closings = [];
  
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

function extractCharacteristicPhrases(posts) {
  const allText = posts.join(" ");
  const phrases = [];
  
  // Extract 2-4 word phrases that appear multiple times
  const words = allText.split(/\s+/);
  const phraseMap = new Map();
  
  for (let len = 2; len <= 4; len++) {
    for (let i = 0; i <= words.length - len; i++) {
      const phrase = words.slice(i, i + len).join(" ").toLowerCase();
      // Skip phrases with punctuation in the middle
      if (/^[\w\s]+$/.test(phrase)) {
        phraseMap.set(phrase, (phraseMap.get(phrase) || 0) + 1);
      }
    }
  }
  
  // Get phrases that appear more than once
  for (const [phrase, count] of phraseMap.entries()) {
    if (count >= 2 && phrase.split(" ").length >= 2) {
      phrases.push({ phrase, count });
    }
  }
  
  phrases.sort((a, b) => b.count - a.count);
  return phrases.slice(0, 15).map(p => p.phrase);
}

function humanizeText(text, preserveStyle = false) {
  let h = text;
  h = h.replace(/—/g, ",");
  h = h.replace(/\*\*/g, "");
  h = h.replace(/\*/g, "");
  h = h.replace(/#{1,6}\s/g, "");
  
  // Only apply aggressive replacements when not preserving style
  if (!preserveStyle) {
    const banned = [
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

// ===== Social Network Adaptation =====

function adaptForSocialNetwork(text, socialNetwork, authorStyle) {
  let adapted = text;
  const sn = socialNetwork.toLowerCase();
  
  if (sn === "linkedin") {
    // LinkedIn: more professional, structured, limited emojis
    // Remove excessive emojis but keep a few if the author uses them
    if (authorStyle.emojis_per_post < 1) {
      adapted = adapted.replace(/[\u{1F300}-\u{1FAFF}]/gu, "");
    } else {
      // Keep only 1-2 emojis
      const emojis = adapted.match(/[\u{1F300}-\u{1FAFF}]/gu) || [];
      if (emojis.length > 2) {
        let count = 0;
        adapted = adapted.replace(/[\u{1F300}-\u{1FAFF}]/gu, (match) => {
          count++;
          return count <= 2 ? match : "";
        });
      }
    }
    // Make sure it ends with a professional closing thought
    if (!adapted.match(/\.$|!$|\?$/)) {
      adapted += ".";
    }
  } else if (sn === "instagram") {
    // Instagram: more emotional, hashtags, emojis welcome, storytelling
    if (authorStyle.emojis_per_post >= 0.5 && !adapted.match(/[\u{1F300}-\u{1FAFF}]/u)) {
      // Add an emoji at the end if the author typically uses them
      adapted += " ✨";
    }
  } else if (sn === "telegram") {
    // Telegram: more direct, informal, short format
    // Keep it concise if it gets too long
    const words = adapted.split(/\s+/);
    if (words.length > 100) {
      const sentences = adapted.split(/(?<=[.!?])\s+/);
      adapted = sentences.slice(0, Math.ceil(sentences.length * 0.7)).join(" ");
    }
  } else if (sn === "facebook") {
    // Facebook: mixed style, personal stories, questions welcome
    // Add a question if the author typically asks questions
    if (authorStyle.quest_per_post >= 0.5 && !adapted.includes("?")) {
      adapted += " What do you think?";
    }
  }
  
  return adapted;
}

// ===== Main Generation Function =====

function generateStyledPost(authorId, socialNetwork, topic, samplePosts) {
  // Parse the topic/input
  const parsed = parseInput(topic);
  
  // Extract comprehensive style features
  const authorStyle = extractStyleFeatures(samplePosts);
  
  // Generate the base text using author's style
  let generatedText = expandInput(parsed, authorStyle, socialNetwork, samplePosts);
  
  // Try to enhance with Markov chain for more author-specific vocabulary
  // Only use for informal styles as it works better there
  const chain = buildMarkov(samplePosts, 2);
  if (chain.size > 0 && samplePosts.length >= 3 && authorStyle.tonality.formality !== "formal") {
    const topicTokens = tokenize(topic).filter((x) => /\w/.test(x));
    const maxTokens = 80;
    
    const markovText = generateFromMarkov(chain, 2, maxTokens, topicTokens);
    if (markovText && !isGibberish(markovText)) {
      // Only append relevant Markov-generated content
      // Remove hashtags from markov text
      const cleanMarkovText = markovText.replace(/#\w+/g, '').trim();
      const markovSentences = cleanMarkovText.split(/(?<=[.!?])\s+/).filter(s => {
        const trimmed = s.trim();
        return trimmed.length > 15 && trimmed.length < 120 && !trimmed.startsWith('#');
      });
      
      if (markovSentences.length > 0) {
        // Filter for relevant sentences that don't repeat existing content
        const existingLower = generatedText.toLowerCase();
        const relevantSentences = markovSentences
          .filter(s => {
            const lower = s.toLowerCase();
            // Skip if it starts like it's from the middle of a sentence
            if (/^(and|but|so|or|the|a|is|are)\s/i.test(s.trim())) {
              return false;
            }
            
            // Check if sentence is related to the topic
            const isRelevant = (parsed.location && lower.includes(parsed.location.toLowerCase())) ||
                   lower.includes("architecture") ||
                   lower.includes("experience") ||
                   lower.includes("amazing") ||
                   lower.includes("incredible") ||
                   lower.includes("view") ||
                   lower.includes("city") ||
                   lower.includes("love");
            
            // Check for significant overlap with existing text
            const words = lower.split(/\s+/).filter(w => w.length > 3);
            const uniqueWords = words.filter(w => !existingLower.includes(w));
            const noveltyRatio = uniqueWords.length / Math.max(1, words.length);
            
            return isRelevant && noveltyRatio > 0.4;
          })
          .slice(0, 1); // Only take 1 sentence
        
        if (relevantSentences.length > 0) {
          generatedText += " " + relevantSentences[0].trim();
        }
      }
    }
  }
  
  // Clean up the text (preserve style)
  generatedText = humanizeText(generatedText, true);
  generatedText = cutToFullSentence(generatedText);
  
  // Adapt for social network
  generatedText = adaptForSocialNetwork(generatedText, socialNetwork, authorStyle);
  
  // Generate hashtags based on the author's style and social network
  const hashtags = generateHashtags(parsed, socialNetwork, authorStyle);
  
  // Combine text with hashtags
  const hashtagString = hashtags.length > 0 ? hashtags.join(' ') : '';
  const finalPost = generatedText + (hashtagString ? '\n\n' + hashtagString : '');
  
  return finalPost;
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
  
  // Remove duplicates and clean up, also filter out landmarks
  const landmarks = ["eiffel tower", "big ben", "tower bridge", "statue of liberty", "colosseum", "taj mahal", 
    "great wall", "pyramids", "burj khalifa", "sydney opera house", "golden gate", "christ the redeemer",
    "tower", "bridge", "monument", "statue", "cathedral", "palace", "castle", "museum", "gallery"];
  const uniquePeople = Array.from(new Set(people.map(p => p.trim()).filter(p => {
    if (p.length === 0) return false;
    const lower = p.toLowerCase();
    // Filter out if it contains a landmark word
    return !landmarks.some(l => lower.includes(l));
  })));
  
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

function generateHashtags(parsed, socialNetwork, authorStyle) {
  const hashtags = [];
  
  // Extract hashtags from sample posts if author uses them
  if (authorStyle && authorStyle.hashtags_per_post >= 0.5) {
    // If author uses hashtags, follow their pattern
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`);
      // Only add travel-related hashtags for informal authors
      if (authorStyle.tonality && authorStyle.tonality.formality !== "formal") {
        hashtags.push(`#${loc}travel`);
      }
    }
  } else if (authorStyle && authorStyle.hashtags_per_post < 0.5) {
    // If author rarely uses hashtags, add minimal hashtags
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`);
    }
    const unique = Array.from(new Set(hashtags));
    return unique.slice(0, 3);
  } else {
    // Default hashtag behavior
    if (parsed.location) {
      const loc = parsed.location.toLowerCase().replace(/\s+/g, '');
      hashtags.push(`#${loc}`, `#${loc}travel`);
    }
  }
  
  // Add activity-based hashtags (but be smarter about it)
  const goodActivityWords = ["explore", "travel", "adventure", "architecture", "food", "culture", "nature", "beach", "mountain", "city", "tour", "visit"];
  for (const activity of parsed.activities) {
    const words = activity.toLowerCase().split(/\s+/);
    for (const word of words) {
      if (word.length > 4 && /^[a-z]+$/.test(word)) {
        // Don't strip endings that would make nonsense words
        let cleanWord = word;
        if (word.endsWith('ed') && word.length > 6) {
          cleanWord = word.slice(0, -2);
          // If it ends in a doubled consonant, remove one
          if (/([bcdfghjklmnpqrstvwxyz])\1$/.test(cleanWord)) {
            cleanWord = cleanWord.slice(0, -1);
          }
        } else if (word.endsWith('ing') && word.length > 7) {
          cleanWord = word.slice(0, -3);
          // If it ends in a doubled consonant, remove one
          if (/([bcdfghjklmnpqrstvwxyz])\1$/.test(cleanWord)) {
            cleanWord = cleanWord.slice(0, -1);
          }
        }
        
        // Only add if it's a meaningful word (at least 5 chars after cleanup)
        if (cleanWord.length >= 5 && !["went", "that", "this", "with", "from", "have", "been", "made", "took", "came", "very", "explor", "explo"].includes(cleanWord)) {
          hashtags.push(`#${cleanWord}`);
        }
      }
    }
  }
  
  // Add general travel hashtags based on social network
  const sn = socialNetwork.toLowerCase();
  if (sn === 'instagram') {
    hashtags.push('#travel', '#wanderlust', '#explore');
    if (authorStyle && authorStyle.emojis_per_post > 1) {
      hashtags.push('#adventure', '#travelgram');
    }
  } else if (sn === 'linkedin') {
    // LinkedIn - more professional hashtags
    if (parsed.location) {
      hashtags.push('#businesstravel');
    }
    hashtags.push('#networking', '#professional');
  } else if (sn === 'telegram') {
    // Telegram - minimal hashtags
    hashtags.push('#travel');
  }
  
  // Add people-related hashtags only for informal styles
  if (parsed.people && parsed.people.length > 0 && authorStyle && authorStyle.tonality.formality !== "formal") {
    hashtags.push('#meetup', '#friends');
  }
  
  const unique = Array.from(new Set(hashtags));
  
  // Limit hashtags based on social network and author style
  let maxHashtags;
  if (sn === 'instagram') {
    maxHashtags = authorStyle && authorStyle.hashtags_per_post > 2 ? 10 : 6;
  } else if (sn === 'linkedin') {
    maxHashtags = 4;
  } else {
    maxHashtags = 4;
  }
  
  return unique.slice(0, maxHashtags);
}

function expandInput(parsed, authorStyle, socialNetwork, samplePosts) {
  const parts = [];
  const { tonality, openingClosing, characteristicPhrases, language, emojis_per_post } = authorStyle;
  
  // Detect if this is a travel topic or something else
  const isTravelTopic = parsed.location || 
    parsed.activities.some(a => /\b(visit|travel|explore|trip|vacation|holiday|tour|sight)\b/i.test(a));
  
  // Generate a clean opening based on the author's style and tonality
  if (tonality.formality === "formal") {
    if (parsed.location) {
      parts.push(`Recently had the opportunity to visit ${parsed.location}.`);
    } else if (isTravelTopic) {
      parts.push("Excited to share a recent travel experience.");
    } else {
      parts.push("Excited to share a recent experience.");
    }
  } else {
    // For informal style, use a varied opening based on topic type
    if (isTravelTopic) {
      const informalOpenings = [
        parsed.location ? `Just arrived in ${parsed.location}!` : "What an adventure!",
        parsed.location ? `${parsed.location} vibes!` : "Loving this!",
        parsed.location ? `Exploring ${parsed.location}!` : "Travel time!",
      ];
      parts.push(randomChoice(informalOpenings));
    } else {
      // Non-travel topic
      const generalOpenings = [
        "Excited to share this!",
        "Big news!",
        "Reflecting on something important.",
        "Had an interesting experience recently.",
      ];
      parts.push(randomChoice(generalOpenings));
    }
  }
  
  // Location description based on style (only if not already mentioned)
  if (parsed.location && !parts[0].toLowerCase().includes(parsed.location.toLowerCase())) {
    if (tonality.formality === "formal") {
      parts.push(`The city offers a unique blend of culture and innovation.`);
    } else if (tonality.positivity === "positive") {
      parts.push(`It's absolutely breathtaking!`);
    } else {
      parts.push(`So much to see and do here.`);
    }
  }
  
  // Activities - use the author's typical phrasing patterns
  if (parsed.activities.length > 0) {
    const cleanActivities = parsed.activities.map(a => {
      let cleaned = a.trim().replace(/^I\s+/i, '');
      if (parsed.location && cleaned.toLowerCase().includes(parsed.location.toLowerCase())) {
        return null;
      }
      // Check if this is actually an activity (has a verb at the start) or just a noun phrase
      const isActivity = /^(explored|visited|saw|discovered|experienced|enjoyed|tried|tasted|walked|hiked|drove|flew|stayed|relaxed|shopped|danced|partied|swam|surfed|skied|climbed|photographed|admired|appreciated|went|traveled|met|learned|attended|had)/i.test(cleaned);
      
      if (isActivity) {
        // Fix grammar: add "the" before noun phrases when needed
        if (cleaned.match(/^(explored|visited|saw)\s+/i)) {
          cleaned = cleaned.replace(/^(explored|visited|saw)\s+(?!the\s)/i, (match, verb) => {
            return verb + ' the ';
          });
        }
        return cleaned;
      } else {
        // This is a topic/theme, not an activity
        // Convert to lowercase and use as a subject for reflection
        const lowerCleaned = cleaned.charAt(0).toLowerCase() + cleaned.slice(1);
        return `reflected on ${lowerCleaned}`;
      }
    }).filter(a => a !== null && a.length > 0);
    
    if (cleanActivities.length > 0) {
      if (tonality.formality === "formal") {
        const activityText = cleanActivities.join(" and ");
        // Don't say "During my time there" if there's no location
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
        
        // Use the author's characteristic words if available
        const positiveAdjective = authorStyle.favorite_tokens.find(t => 
          ["amazing", "incredible", "stunning", "beautiful", "awesome", "wonderful", "fantastic"].includes(t.toLowerCase())
        ) || (tonality.positivity === "positive" ? "amazing" : "great");
        
        parts.push(`I ${activityText}. It was ${positiveAdjective}!`);
      }
    }
  }
  
  // Add people met
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
  
  // Add a characteristic phrase from the author if available and relevant
  if (characteristicPhrases && characteristicPhrases.length > 0) {
    const relevantPhrase = characteristicPhrases.find(p => {
      const lowerPhrase = p.toLowerCase();
      // Check if the phrase is related to travel, architecture, or general positive expressions
      return lowerPhrase.includes("amazing") || lowerPhrase.includes("love") || 
             lowerPhrase.includes("incredible") || lowerPhrase.includes("experience") ||
             lowerPhrase.includes("every corner") || lowerPhrase.includes("cant wait");
    });
    if (relevantPhrase && Math.random() > 0.3) {
      // Capitalize first letter
      const phrase = relevantPhrase.charAt(0).toUpperCase() + relevantPhrase.slice(1);
      if (!phrase.endsWith(".") && !phrase.endsWith("!") && !phrase.endsWith("?")) {
        parts.push(phrase + ".");
      } else {
        parts.push(phrase);
      }
    }
  }
  
  // Add a closing based on style and social network
  let closing = "";
  if (openingClosing.closings && openingClosing.closings.length > 0) {
    closing = randomChoice(openingClosing.closings);
  } else {
    if (tonality.formality === "formal") {
      if (socialNetwork === "linkedin") {
        closing = "Looking forward to exploring more opportunities in this space.";
      } else {
        closing = "A truly remarkable experience.";
      }
    } else {
      if (socialNetwork === "instagram") {
        closing = "Highly recommend visiting if you get the chance!";
      } else {
        closing = "Can't wait for the next adventure!";
      }
    }
  }
  
  // Only add closing if it makes sense and doesn't repeat
  if (closing && !parts.some(p => p.toLowerCase().includes(closing.toLowerCase().slice(0, 20)))) {
    parts.push(closing);
  }
  
  // Add emojis if the author typically uses them
  let text = parts.join(' ');
  if (emojis_per_post >= 1) {
    // Add emojis based on content
    if (parsed.location) {
      text = text.replace(new RegExp(parsed.location, 'i'), `${parsed.location} 🌆`);
    }
    if (!text.includes("✨") && tonality.positivity === "positive") {
      text += " ✨";
    }
  }
  
  return text;
}

function adaptOpeningToTopic(sampleOpening, parsed, tonality) {
  // Try to adapt the sample opening to the current topic
  let opening = sampleOpening;
  
  // If the opening mentions a specific location, replace it with the current one
  const locationPattern = /\b(Dubai|Paris|London|Tokyo|New York|Moscow|Berlin|Rome|Barcelona|Amsterdam)\b/gi;
  if (parsed.location && locationPattern.test(opening)) {
    opening = opening.replace(locationPattern, parsed.location);
  }
  
  // If opening starts with "Just" and we have a location, we might keep it
  if (opening.toLowerCase().startsWith("just") && parsed.location && !opening.toLowerCase().includes(parsed.location.toLowerCase())) {
    // Check if it mentions landing, arriving, etc.
    if (opening.toLowerCase().includes("landed") || opening.toLowerCase().includes("arrived")) {
      opening = opening.replace(/\bin\s+\w+/i, `in ${parsed.location}`);
    }
  }
  
  return opening;
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
      favorite_tokens: [],
      language: "en",
      tonality: { formality: "informal", formalityRatio: 0.5, positivity: "neutral", positivityScore: 0 },
      sentencePatterns: {},
      characteristicPhrases: [],
      openingClosing: { openings: [], closings: [] },
      avgPostLength: 0
    };
  }
  
  let emojis = 0;
  let hashtags = 0;
  let exclam = 0;
  let quest = 0;
  let allTokens = [];
  let wordsPerPost = [];
  let charsPerPost = [];
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
  
  const freq = new Map();
  for (const t of allTokens) {
    const key = t.toLowerCase();
    freq.set(key, (freq.get(key) || 0) + 1);
  }
  const top = Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([w]) => w);
  const fav = top.filter((w) => /^\p{L}{4,}$/u.test(w)).slice(0, 10);
  
  // Advanced analysis
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
  
  // Add tonality-based traits
  if (f.tonality) {
    if (f.tonality.formality === "formal") t.push("formal professional style");
    else t.push("casual conversational style");
    
    if (f.tonality.positivity === "positive") t.push("positive enthusiastic tone");
  }
  
  // Add language trait
  if (f.language && f.language !== "en") {
    const langNames = { ru: "Russian", ar: "Arabic", cjk: "Chinese/Japanese" };
    t.push(`writes in ${langNames[f.language] || f.language}`);
  }
  
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
  
  // Parse input and store for display
  const parsed = parseInput(t);
  state.parsedInput = parsed;
  
  // Use the new styled post generation function
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
