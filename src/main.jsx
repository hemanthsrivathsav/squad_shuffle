import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRightLeft,
  Clipboard,
  Dice5,
  RotateCcw,
  UsersRound,
} from 'lucide-react';
import './styles.css';

const sampleNames = [
  'Aarav',
  'Maya',
  'Kabir',
  'Isha',
  'Vihaan',
  'Anaya',
  'Reyansh',
  'Saanvi',
  'Arjun',
  'Nisha',
  'Dev',
  'Tara',
];

const palette = [
  ['#ff4d7d', '#ffb86c'],
  ['#00d5ff', '#7c5cff'],
  ['#62ffb7', '#00a99d'],
  ['#ffd166', '#ef476f'],
  ['#b8f7ff', '#4cc9f0'],
  ['#f7aef8', '#8093f1'],
  ['#caffbf', '#2ec4b6'],
  ['#ffbe0b', '#fb5607'],
];

function parseNames(raw) {
  return raw
    .split(/[\n,]+/)
    .map((name) => name.trim())
    .filter(Boolean);
}

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function makeGroups(names, groupCount) {
  const groups = Array.from({ length: groupCount }, () => []);
  shuffle(names).forEach((name, index) => {
    groups[index % groupCount].push(name);
  });
  return groups;
}

function App() {
  const [rawNames, setRawNames] = useState(sampleNames.join('\n'));
  const [groupCount, setGroupCount] = useState(4);
  const [groups, setGroups] = useState(() => makeGroups(sampleNames, 4));
  const [copied, setCopied] = useState(false);

  const names = useMemo(() => parseNames(rawNames), [rawNames]);
  const validGroupCount = Math.max(1, Math.min(Number(groupCount) || 1, Math.max(names.length, 1)));
  const canShuffle = names.length > 0;

  function randomize() {
    if (!canShuffle) return;
    setGroups(makeGroups(names, validGroupCount));
    setCopied(false);
  }

  function loadSample() {
    setRawNames(sampleNames.join('\n'));
    setGroupCount(4);
    setGroups(makeGroups(sampleNames, 4));
    setCopied(false);
  }

  function updateGroupCount(value) {
    const digitsOnly = value.replace(/\D/g, '');
    setGroupCount(digitsOnly);
  }

  async function copyTeams() {
    const text = groups
      .map((team, index) => `Team ${index + 1}\n${team.map((name) => `- ${name}`).join('\n')}`)
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  }

  return (
    <main className="app-shell">
      <section className="command-deck">
        <div className="intro">
          <h1>Squad Shuffle</h1>
          <p className="lede">
            Drop in names, choose how many groups you need, and deal everyone into balanced teams with a single cosmic roll.
          </p>
        </div>

        <div className="control-panel">
          <label className="field-label" htmlFor="names">
            Names
          </label>
          <textarea
            id="names"
            value={rawNames}
            onChange={(event) => setRawNames(event.target.value)}
            placeholder="Paste names here, one per line or comma separated"
            spellCheck="false"
          />

          <div className="split-controls">
            <label className="group-input" htmlFor="groupCount">
              <span>Groups</span>
              <input
                id="groupCount"
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={groupCount}
                onChange={(event) => updateGroupCount(event.target.value)}
              />
            </label>

            <div className="stat-card">
              <UsersRound size={18} />
              <span>{names.length}</span>
              <small>names ready</small>
            </div>
          </div>

          <div className="actions">
            <button className="primary-action" onClick={randomize} disabled={!canShuffle}>
              <Dice5 size={20} />
              Shuffle Teams
            </button>
            <button className="icon-action" onClick={loadSample} aria-label="Reset sample names" title="Reset sample names">
              <RotateCcw size={19} />
            </button>
            <button className="icon-action" onClick={copyTeams} aria-label="Copy teams" title="Copy teams">
              <Clipboard size={19} />
            </button>
          </div>

          <div className="hint-row">
            <ArrowRightLeft size={16} />
            <span>{copied ? 'Teams copied' : 'Have fun !'}</span>
          </div>
        </div>
      </section>

      <section className="teams-stage" aria-label="Generated teams">
        <div className="teams-grid">
          {groups.map((team, index) => {
            const colors = palette[index % palette.length];
            return (
              <article
                className="team-card"
                key={`${index}-${team.join('-')}`}
                style={{ '--accent-a': colors[0], '--accent-b': colors[1], '--delay': `${index * 70}ms` }}
              >
                <div className="team-card-top">
                  <span className="team-number">{String(index + 1).padStart(2, '0')}</span>
                  <span className="team-size">{team.length} members</span>
                </div>
                <h3>Team {index + 1}</h3>
                <ul>
                  {team.length > 0 ? (
                    team.map((name, memberIndex) => <li key={`${name}-${memberIndex}`}>{name}</li>)
                  ) : (
                    <li className="empty-slot">Waiting for a name</li>
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
