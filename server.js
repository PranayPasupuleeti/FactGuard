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

function analyzeResults(organic, claim) {
  const factCheckResults = [];
  let truthScore = 0;
  let falseScore = 0;
  const evidenceItems = [];
  const sourceLinks = [];
  const newsSources = [];
  let explanationParts = [];
  let additionalInfoParts = [];

  for (const result of organic) {
    const snippet = (result.snippet || '').toLowerCase();
    const title = result.title || '';
    const link = result.link || '';
    const lowerLink = link.toLowerCase();
    const combined = snippet + ' ' + title.toLowerCase();

    const isFactCheckSite = FACT_CHECK_DOMAINS.some(d => lowerLink.includes(d));
    const isNewsSite = NEWS_DOMAINS.some(d => lowerLink.includes(d));

    const truthMatches = TRUTH_KEYWORDS.filter(k => combined.includes(k)).length;
    const falseMatches = FALSE_KEYWORDS.filter(k => combined.includes(k)).length;

    if (isFactCheckSite) {
      factCheckResults.push({ result, truthMatches, falseMatches });
    }

    if (isNewsSite && title) {
      newsSources.push({ title, link, source: extractSourceName(link) });
    }

    truthScore += truthMatches;
    falseScore += falseMatches;

    if (result.snippet) evidenceItems.push(result.snippet);
    if (link) sourceLinks.push(link);
  }

  const totalScore = truthScore + falseScore;
  let confidence = 0;
  let confidenceReason = '';
  let verdict = 'Unverifiable';
  const totalSources = organic.length;

  explanationParts.push(`We searched for information about this claim across ${totalSources} different web sources and analyzed the results to determine accuracy.`);

  if (factCheckResults.length > 0) {
    const fcTruth = factCheckResults.reduce((s, r) => s + r.truthMatches, 0);
    const fcFalse = factCheckResults.reduce((s, r) => s + r.falseMatches, 0);
    const fcSites = factCheckResults.map(r => extractSourceName(r.result.link)).join(', ');
    explanationParts.push(`Out of these results, ${factCheckResults.length} came from recognized fact-checking or authoritative sources such as ${fcSites}, which we weigh more heavily in our analysis.`);

    if (fcTruth > fcFalse) {
      confidence = Math.min(60 + (fcTruth / (fcTruth + fcFalse)) * 30, 92);
      confidenceReason = `Base confidence of 60% from fact-check sources, increased by the ratio of supporting vs contradicting signals (${fcTruth} supporting vs ${fcFalse} contradicting keyword matches across ${factCheckResults.length} fact-check sources).`;
      verdict = confidence >= 85 ? 'True' : 'Mostly True';
      explanationParts.push('The fact-checking sources we found support or confirm the accuracy of this claim. Authoritative sources use language like confirmed, verified, or accurate, indicating the claim is credible and backed by evidence.');
    } else if (fcFalse > fcTruth) {
      confidence = Math.min(60 + (fcFalse / (fcTruth + fcFalse)) * 30, 92);
      confidenceReason = `Base confidence of 60% from fact-check sources, increased by the ratio of contradicting vs supporting signals (${fcFalse} contradicting vs ${fcTruth} supporting keyword matches across ${factCheckResults.length} fact-check sources).`;
      verdict = confidence >= 85 ? 'False' : 'Mostly False';
      explanationParts.push('The fact-checking sources we found contradict or debunk this claim. These sources use language indicating the claim is misleading, false, or lacks evidence. This claim is not accurate and is based on misinformation.');
    }
  }

  if (totalScore > 0 && verdict === 'Unverifiable') {
    const ratio = truthScore / totalScore;
    const truthKws = TRUTH_KEYWORDS.filter(k => organic.some(r => (r.snippet + ' ' + r.title).toLowerCase().includes(k)));
    const falseKws = FALSE_KEYWORDS.filter(k => organic.some(r => (r.snippet + ' ' + r.title).toLowerCase().includes(k)));

    if (truthKws.length > 0) {
      explanationParts.push(`In our general web search, we detected supporting language such as "${truthKws.slice(0, 3).join('", "')}" across multiple sources.`);
    }
    if (falseKws.length > 0) {
      explanationParts.push(`We also detected contradicting language such as "${falseKws.slice(0, 3).join('", "')}" in some sources.`);
    }

    if (ratio > 0.7) {
      confidence = Math.round(50 + ratio * 20);
      confidenceReason = `Base confidence of 50% from general web sources, adjusted up because supporting keyword ratio was ${Math.round(ratio * 100)}% (${truthScore} supporting vs ${falseScore} contradicting keyword matches).`;
      verdict = confidence >= 65 ? 'Mostly True' : 'Partially True';
      explanationParts.push('A clear majority of web sources support this claim. The evidence leans heavily in its favor across multiple sources.');
    } else if (ratio < 0.3) {
      confidence = Math.round(50 + (1 - ratio) * 20);
      confidenceReason = `Base confidence of 50% from general web sources, adjusted up because contradicting keyword ratio was ${Math.round((1 - ratio) * 100)}% (${falseScore} contradicting vs ${truthScore} supporting keyword matches).`;
      verdict = confidence >= 65 ? 'Mostly False' : 'Partially False';
      explanationParts.push('A clear majority of web sources contradict this claim. The evidence found suggests it is inaccurate or misleading.');
    } else {
      confidence = 30;
      confidenceReason = `Confidence set to 30% because general web sources are mixed (${truthScore} supporting vs ${falseScore} contradicting keyword matches). The ratio of ${Math.round(ratio * 100)}% supporting is too close to 50% to be decisive.`;
      verdict = 'Partially True';
      explanationParts.push('Web sources are divided on this claim, with some supporting and some contradicting it. This claim may be nuanced or depend on specific context. Review the evidence below and verify through additional sources.');
    }
  }

  if (verdict === 'Unverifiable') {
    confidence = 15;
    confidenceReason = 'Default low confidence of 15% because no fact-check sources were found and general web sources lacked sufficient supporting or contradicting keywords to make an assessment. Higher confidence requires clearer signals from authoritative sources.';
    explanationParts.push('We could not find enough clear information to assess the accuracy of this claim. The available search results did not contain strong supporting or contradicting language. Review the sources below and try searching with different keywords for more information.');
  }

  const usefulSnippets = organic.map(r => r.snippet).filter(Boolean).slice(0, 3);
  if (usefulSnippets.length > 0) {
    additionalInfoParts.push(`Key context from search results: ${usefulSnippets.join(' ')}`);
  }

  if (factCheckResults.length > 0) {
    const fcSites = factCheckResults.map(r => extractSourceName(r.result.link)).join(', ');
    const topFc = factCheckResults.slice(0, 2).map(r => `"${r.result.title}"`).join(' and ');
    additionalInfoParts.push(`Fact-check verdicts found: ${topFc} from sources like ${fcSites}.`);
  }

  if (newsSources.length > 0) {
    const newsTitles = newsSources.slice(0, 2).map(s => `"${s.title}"`).join(' and ');
    additionalInfoParts.push(`Related news coverage: ${newsTitles} from ${newsSources.map(s => s.source).join(', ')}.`);
  }

  const reducedEvidence = evidenceItems.slice(0, 5);
  const reducedSources = sourceLinks.slice(0, 5);
  const reducedNewsSources = newsSources.slice(0, 5);
  const explanation = explanationParts.join(' ') || 'Analysis based on web search results.';
  const additionalInfo = additionalInfoParts.join(' ');

  return {
    verdict, confidence: Math.round(confidence), confidenceReason,
    explanation,
    evidence: reducedEvidence, sources: reducedSources,
    newsSources: reducedNewsSources,
    additionalInfo,
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
