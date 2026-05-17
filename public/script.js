const claimInput = document.getElementById('claimInput');
const checkBtn = document.getElementById('checkBtn');
const resultSection = document.getElementById('resultSection');
const verdictBadge = document.getElementById('verdictBadge');
const verdictText = document.getElementById('verdictText');
const confidenceFill = document.getElementById('confidenceFill');
const confidenceValue = document.getElementById('confidenceValue');
const claimDisplay = document.getElementById('claimDisplay');
const explanationText = document.getElementById('explanationText');
const evidenceList = document.getElementById('evidenceList');
const sourcesList = document.getElementById('sourcesList');
const newsList = document.getElementById('newsList');
const newsSection = document.getElementById('newsSection');
const additionalInfoText = document.getElementById('additionalInfoText');
const additionalInfoSection = document.getElementById('additionalInfoSection');
const confidenceReason = document.getElementById('confidenceReason');
const spinner = document.querySelector('.spinner');
const btnText = document.querySelector('.btn-text');
const btnIcon = document.querySelector('.btn-icon');
const exampleBtns = document.querySelectorAll('.example-btn');

exampleBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    claimInput.value = btn.dataset.claim;
    claimInput.focus();
  });
});

checkBtn.addEventListener('click', checkClaim);

claimInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.shiftKey) return;
  if (e.key === 'Enter') {
    e.preventDefault();
    checkClaim();
  }
});

async function checkClaim() {
  const claim = claimInput.value.trim();
  if (!claim) {
    shakeElement(claimInput);
    return;
  }

  setLoading(true);

  try {
    const res = await fetch('/api/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claim }),
    });

    const data = await res.json();

    if (data.verdict === 'Error') {
      showError(data.explanation);
      return;
    }

    displayResult(data, claim);
  } catch (err) {
    showError('Network error. Please check your connection and try again.');
  } finally {
    setLoading(false);
  }
}

function displayResult(data, claim) {
  const verdict = data.verdict || 'Unverifiable';
  const confidence = data.confidence || 0;

  const normalizedVerdict = verdict.toLowerCase().replace(/\s+/g, '-');

  const verdictLabels = {
    'true': 'True',
    'mostly-true': 'Mostly True',
    'partially-true': 'Partially True',
    'mostly-false': 'Mostly False',
    'false': 'False',
    'unverifiable': 'Unverifiable',
  };

  const label = verdictLabels[normalizedVerdict] || verdict;

  verdictBadge.className = 'verdict-badge ' + normalizedVerdict;
  verdictText.textContent = label;

  confidenceFill.style.width = confidence + '%';
  confidenceValue.textContent = confidence + '%';

  claimDisplay.textContent = claim;
  explanationText.textContent = data.explanation || 'No analysis available.';
  confidenceReason.textContent = data.confidenceReason || '';

  evidenceList.innerHTML = '';
  if (data.evidence && data.evidence.length > 0) {
    data.evidence.forEach(item => {
      const li = document.createElement('li');
      li.textContent = item;
      evidenceList.appendChild(li);
    });
  } else {
    evidenceList.innerHTML = '<li style="color:#6b7280">No specific evidence listed.</li>';
  }

  sourcesList.innerHTML = '';
  if (data.sources && data.sources.length > 0) {
    data.sources.forEach(src => {
      const li = document.createElement('li');
      if (src.startsWith('http://') || src.startsWith('https://')) {
        const a = document.createElement('a');
        a.href = src;
        try {
          const url = new URL(src);
          a.textContent = url.hostname.replace('www.', '') + url.pathname;
        } catch {
          a.textContent = src;
        }
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        li.appendChild(a);
      } else {
        li.textContent = src;
      }
      sourcesList.appendChild(li);
    });
  } else {
    sourcesList.innerHTML = '<li style="color:#6b7280">No sources provided.</li>';
  }

  newsList.innerHTML = '';
  if (data.newsSources && data.newsSources.length > 0) {
    newsSection.classList.remove('hidden');
    data.newsSources.forEach(item => {
      const li = document.createElement('li');
      const a = document.createElement('a');
      a.href = item.link;
      a.textContent = item.title + ' (' + item.source + ')';
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
      li.appendChild(a);
      newsList.appendChild(li);
    });
  } else {
    newsSection.classList.add('hidden');
  }

  if (data.additionalInfo) {
    additionalInfoSection.classList.remove('hidden');
    additionalInfoText.textContent = data.additionalInfo;
  } else {
    additionalInfoSection.classList.add('hidden');
  }

  resultSection.classList.remove('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function showError(msg) {
  resultSection.classList.remove('hidden');
  verdictBadge.className = 'verdict-badge unverifiable';
  verdictText.textContent = 'Error';
  confidenceFill.style.width = '0%';
  confidenceValue.textContent = '0%';
  claimDisplay.textContent = claimInput.value.trim();
  explanationText.textContent = msg;
  evidenceList.innerHTML = '<li style="color:#6b7280">No evidence available.</li>';
  sourcesList.innerHTML = '<li style="color:#6b7280">No sources available.</li>';
  newsSection.classList.add('hidden');
  additionalInfoSection.classList.add('hidden');
  resultSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function setLoading(loading) {
  checkBtn.disabled = loading;
  spinner.classList.toggle('hidden', !loading);
  btnText.style.opacity = loading ? '0' : '1';
  btnIcon.style.display = loading ? 'none' : 'inline';
}

function shakeElement(el) {
  el.style.animation = 'shake 0.4s ease';
  el.style.borderColor = 'rgba(239, 68, 68, 0.5)';
  setTimeout(() => {
    el.style.animation = '';
    el.style.borderColor = '';
  }, 500);
}

const style = document.createElement('style');
style.textContent = `
  @keyframes shake {
    0%, 100% { transform: translateX(0); }
    25% { transform: translateX(-6px); }
    50% { transform: translateX(6px); }
    75% { transform: translateX(-4px); }
  }
`;
document.head.appendChild(style);
