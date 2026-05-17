const express = require('express');
const cors = require('cors');
const { getJson } = require('serpapi');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

const FACT_CHECK_DOMAINS = [
  'snopes.com', 'politifact.com', 'factcheck.org', 'reuters.com/fact-check',
  'apnews.com/article/fact-checking', 'bbc.com/news', 'reuters.com/article',
  'science.org', 'nature.com', 'who.int', 'cdc.gov', 'nih.gov',
  'mayoclinic.org', 'healthline.com', 'webmd.com',
  'education.nationalgeographic.org', 'britannica.com', 'history.com',
  'nasa.gov', 'noaa.gov', 'usgs.gov', 'energy.gov',
  'acm.org', 'ieee.org',
];

const TRUTH_KEYWORDS = [
  'true', 'confirmed', 'verified', 'accurate', 'correct', 'fact', 'evidence supports',
  'real', 'genuine', 'authentic', 'proven', 'right', 'valid',
];

const FALSE_KEYWORDS = [
  'false', 'fake', 'misleading', 'debunked', 'hoax', 'myth', 'incorrect',
  'inaccurate', 'wrong', 'untrue', 'fabricated', 'fiction', 'unsubstantiated',
  'no evidence', 'refuted', 'disproven', 'misinformation', 'disinformation',
  'conspiracy theory', 'scam', 'rumor',
];

const SOCIAL_DOMAINS = [
  'facebook.com', 'fb.com', 'reddit.com', 'quora.com', 'twitter.com',
  'x.com', 'instagram.com', 'tiktok.com', 'linkedin.com', 'pinterest.com',
  'youtube.com', 'youtu.be', 'tumblr.com', 'threads.net', 'snapchat.com',
  'discord.com', 'telegram.org', 'whatsapp.com',
];

const NEWS_DOMAINS = [
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk', 'cnn.com',
  'npr.org', 'nytimes.com', 'wsj.com', 'washingtonpost.com',
  'theguardian.com', 'economist.com', 'bloomberg.com',
  'usatoday.com', 'nbcnews.com', 'abcnews.go.com', 'cbsnews.com',
  'aljazeera.com', 'france24.com', 'dw.com',
];

function extractSourceName(url) {
  try {
    const hostname = new URL(url).hostname.replace('www.', '');
    return hostname;
  } catch {
    return url;
  }
}

const AUTHORITY_DOMAINS = [
  '.gov', '.edu', '.org',
  'who.int', 'un.org', 'unesco.org', 'nasa.gov', 'cdc.gov', 'nih.gov',
  'science.org', 'nature.com', 'springer.com', 'sciencedirect.com',
  'reuters.com', 'apnews.com', 'bbc.com', 'bbc.co.uk',
  'theconversation.com', 'scientificamerican.com', 'newscientist.com',
];

function getDomainAuthority(link) {
  const lower = link.toLowerCase();
  for (const d of AUTHORITY_DOMAINS) {
    if (lower.includes(d)) return 2;
  }
  if (FACT_CHECK_DOMAINS.some(d => lower.includes(d))) return 2;
  if (NEWS_DOMAINS.some(d => lower.includes(d))) return 1;
  return 0;
}

function analyzeResults(organic, claim) {
  let factCheckSources = [];
  let strongForCount = 0;
  let strongAgainstCount = 0;
  let weakForCount = 0;
  let weakAgainstCount = 0;
  const evidenceItems = [];
  const sourceLinks = [];
  const newsSources = [];

  for (const result of organic) {
    const snippet = (result.snippet || '').toLowerCase();
    const title = result.title || '';
    const link = result.link || '';
    const lowerLink = link.toLowerCase();
    const authority = getDomainAuthority(link);
    const isFactCheck = FACT_CHECK_DOMAINS.some(d => lowerLink.includes(d));
    const isNews = NEWS_DOMAINS.some(d => lowerLink.includes(d));
    const combined = snippet + ' ' + title.toLowerCase();

    const truthHits = TRUTH_KEYWORDS.filter(k => combined.includes(k)).length;
    const falseHits = FALSE_KEYWORDS.filter(k => combined.includes(k)).length;
    const net = truthHits - falseHits;

    if (isFactCheck) {
      factCheckSources.push({ result, net, authority, snippet: result.snippet, title: result.title, link });
    }

    if (isNews && title) {
      newsSources.push({ title, link, source: extractSourceName(link) });
    }

    if (authority === 2) {
      if (net > 0) strongForCount++;
      else if (net < 0) strongAgainstCount++;
    } else {
      if (net > 0) weakForCount++;
      else if (net < 0) weakAgainstCount++;
    }

    if (result.snippet) evidenceItems.push(result.snippet);
    if (link) sourceLinks.push(link);
  }

  const forScore = strongForCount * 3 + weakForCount;
  const againstScore = strongAgainstCount * 3 + weakAgainstCount;

  let verdict = 'Unverifiable';
  let confidence = 15;
  let confidenceReason = '';
  let explanation = '';
  let additionalInfo = '';

  const totalWeighted = forScore + againstScore;
  const ratio = totalWeighted > 0 ? forScore / totalWeighted : 0.5;

  if (factCheckSources.length > 0) {
    const fcNet = factCheckSources.reduce((s, f) => s + f.net, 0);
    const fcTitles = factCheckSources.slice(0, 2).map(f => f.title).join('; ');
    const fcSites = factCheckSources.map(f => extractSourceName(f.link)).join(', ');

    if (fcNet > 0) {
      confidence = Math.min(75 + Math.abs(fcNet) * 3, 95);
      verdict = 'True';
      confidenceReason = `Fact-check sources (${fcSites}) support this claim. ${Math.abs(fcNet)} more supporting than contradicting keyword signals found across ${factCheckSources.length} authoritative fact-check results.`;
      explanation = `This claim is TRUE. Multiple fact-checking sources confirm its accuracy. Key sources include: ${fcTitles}. These are reputable fact-checking organizations that specialize in verifying claims.`;
    } else if (fcNet < 0) {
      confidence = Math.min(75 + Math.abs(fcNet) * 3, 95);
      verdict = 'False';
      confidenceReason = `Fact-check sources (${fcSites}) contradict this claim. ${Math.abs(fcNet)} more contradicting than supporting keyword signals found across ${factCheckSources.length} authoritative fact-check results.`;
      explanation = `This claim is FALSE. Multiple fact-checking sources refute it. Key sources include: ${fcTitles}. These organizations have investigated this claim and found it to be inaccurate or misleading.`;
    } else {
      confidence = 50;
      verdict = 'Unverifiable';
      confidenceReason = `Fact-check sources found but they show mixed or neutral signals (${factCheckSources.length} sources).`;
      explanation = `This claim could not be clearly verified. Fact-checking sources were found but they do not provide a clear verdict. Review the evidence below.`;
    }
  } else if (totalWeighted > 0) {
    const strongDomains = organic.filter(r => getDomainAuthority(r.link) === 2);
    const topSnippets = organic.slice(0, 3).map(r => r.snippet).filter(Boolean);

    if (ratio > 0.6) {
      confidence = Math.min(50 + Math.round(ratio * 30), 80);
      verdict = 'True';
      confidenceReason = `Out of ${organic.length} search results, ${forScore} weighted signals support vs ${againstScore} against. ${strongDomains.length} high-authority sources found. Confidence limited without dedicated fact-check sources.`;
      explanation = `This claim appears to be TRUE based on web sources. The general consensus from search results supports it. ${topSnippets[0] || ''}`;
    } else if (ratio < 0.4) {
      confidence = Math.min(50 + Math.round((1 - ratio) * 30), 80);
      verdict = 'False';
      confidenceReason = `Out of ${organic.length} search results, ${againstScore} weighted signals contradict vs ${forScore} support. ${strongDomains.length} high-authority sources found. Confidence limited without dedicated fact-check sources.`;
      explanation = `This claim appears to be FALSE based on web sources. The general consensus from search results contradicts it. ${topSnippets[0] || ''}`;
    } else {
      confidence = 30;
      verdict = 'Unverifiable';
      confidenceReason = `Web sources are divided (${forScore} supporting vs ${againstScore} contradicting weighted signals across ${organic.length} results). No clear consensus.`;
      explanation = `This claim could not be clearly verified. Web sources are mixed on this topic, with some supporting and some contradicting it. ${topSnippets[0] || ''} Review the evidence below.`;
    }
  } else {
    explanation = `No clear signals found in search results for this claim. The web sources returned do not contain strong confirming or contradicting language. Try rephrasing the claim or searching with different keywords.`;
  }

  const usefulSnippets = organic.map(r => r.snippet).filter(Boolean).slice(0, 3);
  if (usefulSnippets.length > 0) {
    additionalInfo += `Key context: ${usefulSnippets.join(' ')}`;
  }

  if (factCheckSources.length > 0) {
    const fcSites = factCheckSources.map(f => extractSourceName(f.link)).join(', ');
    const fcTitles = factCheckSources.slice(0, 2).map(f => `"${f.title}"`).join(' and ');
    additionalInfo += ` Fact-check verdicts from ${fcSites}: ${fcTitles}.`;
  }

  if (newsSources.length > 0) {
    const newsTitles = newsSources.slice(0, 2).map(s => `"${s.title}"`).join(' and ');
    additionalInfo += ` News coverage: ${newsTitles} from ${newsSources.map(s => s.source).join(', ')}.`;
  }

  return {
    verdict,
    confidence: Math.round(confidence),
    confidenceReason,
    explanation,
    evidence: evidenceItems.slice(0, 5),
    sources: sourceLinks.slice(0, 5),
    newsSources: newsSources.slice(0, 5),
    additionalInfo: additionalInfo.trim(),
  };
}

app.post('/api/check', async (req, res) => {
  try {
    const { claim } = req.body;
    if (!claim || claim.trim().length === 0) {
      return res.status(400).json({ error: 'Please provide a claim to analyze.' });
    }

    const searchResults = await getJson({
      engine: 'google',
      api_key: process.env.SERPAPI_KEY,
      q: claim + ' fact check',
      num: 10,
    });

    const organic = (searchResults.organic_results || []).filter(r => {
      const link = (r.link || '').toLowerCase();
      return !SOCIAL_DOMAINS.some(d => link.includes(d));
    });

    if (organic.length === 0) {
      return res.json({
        verdict: 'Unverifiable',
        confidence: 0,
        explanation: 'No search results found for this claim. Try rephrasing.',
        evidence: [],
        sources: [],
      });
    }

    const analysis = analyzeResults(organic, claim);
    res.json(analysis);
  } catch (error) {
    console.error('Error:', error.message);
    res.status(500).json({
      verdict: 'Error',
      confidence: 0,
      explanation: 'Search failed: ' + error.message,
      evidence: [],
      sources: [],
    });
  }
});

app.listen(PORT, () => {
  console.log(`FactGuard running at http://localhost:${PORT}`);
});
