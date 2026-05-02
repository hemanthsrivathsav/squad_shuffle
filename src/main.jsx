import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  ArrowRightLeft,
  Clipboard,
  Crown,
  Dice5,
  RotateCcw,
  Share2,
  UsersRound,
} from 'lucide-react';
import './styles.css';

const sampleNames = [];

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

const DEAL_START_DELAY_MS = 300;
const DEAL_FLIGHT_MS = 720;
const DEAL_GAP_MS = 180;
const DEAL_END_DELAY_MS = 720;
const SETTLE_DURATION_MS = 520;

const CAPTAIN_ROLL_INTERVAL_MS = 110;
const CAPTAIN_ROLL_DURATION_MS = 2400;

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

function createEmptyGroups(count) {
  return Array.from({ length: count }, () => []);
}

function getDealOrder(groups) {
  const maxTeamSize = Math.max(...groups.map((team) => team.length), 0);
  const order = [];

  for (let memberIndex = 0; memberIndex < maxTeamSize; memberIndex += 1) {
    groups.forEach((team, teamIndex) => {
      const name = team[memberIndex];

      if (name) {
        order.push({
          name,
          teamIndex,
          memberIndex,
          dealId: order.length,
        });
      }
    });
  }

  return order;
}

function getRandomName(names) {
  return names[Math.floor(Math.random() * names.length)] || '???';
}

function getMemberSlots(groups) {
  return groups.flatMap((team, teamIndex) =>
    team.map((name, memberIndex) => ({
      teamIndex,
      memberIndex,
      name,
    })),
  );
}

function getMemberAnimationKey({ teamIndex, memberIndex, name }) {
  return `${teamIndex}-${memberIndex}-${name}`;
}

function encodeSharePayload(payload) {
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);

  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function decodeSharePayload(encoded) {
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));

  return JSON.parse(new TextDecoder().decode(bytes));
}

function App() {
  const [rawNames, setRawNames] = useState(sampleNames.join('\n'));
  const [groupCount, setGroupCount] = useState();
  const [groups, setGroups] = useState(() => makeGroups(sampleNames, 4));
  const [captains, setCaptains] = useState({});

  const [copied, setCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);

  const [isShuffling, setIsShuffling] = useState(false);
  const [isSettling, setIsSettling] = useState(false);
  const [isPickingCaptains, setIsPickingCaptains] = useState(false);

  const [dealCards, setDealCards] = useState([]);
  const [receivingTeamIndex, setReceivingTeamIndex] = useState(null);
  const [landingMemberKeys, setLandingMemberKeys] = useState([]);
  const [scrambledNames, setScrambledNames] = useState({});
  const [scrambledTeamNames, setScrambledTeamNames] = useState({});
  const [isScrambling, setIsScrambling] = useState(false);
  const [popupMessage, setPopupMessage] = useState('');
  const [isViewingShared, setIsViewingShared] = useState(false);

  const [activeCaptainPick, setActiveCaptainPick] = useState(null);

  const teamsStageRef = useRef(null);
  const teamRefs = useRef([]);
  const dealTimers = useRef([]);
  const settleTimer = useRef(null);
  const captainTimer = useRef(null);
  const captainTicker = useRef(null);

  const names = useMemo(() => parseNames(rawNames), [rawNames]);

  const validGroupCount = Math.max(
    1,
    Math.min(Number(groupCount) || 1, Math.max(names.length, 1)),
  );

  const memberSlots = useMemo(() => getMemberSlots(groups), [groups]);

  const canShuffle = names.length > 0;
  const hasTeams = groups.some((team) => team.length > 0);
  const canPickCaptains =
    hasTeams && !isShuffling && !isPickingCaptains && memberSlots.length > 0;

  useEffect(() => {
    const hash = window.location.hash.replace(/^#/, '');
    const params = new URLSearchParams(hash);
    const sharedTeams = params.get('teams');

    if (!sharedTeams) return;

    try {
      const payload = decodeSharePayload(sharedTeams);

      if (
        !payload ||
        !Array.isArray(payload.groups) ||
        !payload.groups.every(Array.isArray)
      ) {
        return;
      }

      clearDealTimers();
      clearCaptainTimers();

      setGroups(payload.groups);
      setCaptains(payload.captains || {});
      setGroupCount(String(payload.groups.length || 1));
      setIsViewingShared(true);

      setCopied(false);
      setLinkCopied(false);
      setIsShuffling(false);
      setIsSettling(false);
      setIsPickingCaptains(false);
      setDealCards([]);
      setReceivingTeamIndex(null);
      setLandingMemberKeys([]);
      setScrambledNames({});
      setScrambledTeamNames({});
      setIsScrambling(false);
      setActiveCaptainPick(null);
    } catch (error) {
      console.error('Invalid shared teams link:', error);
    }
  }, []);

  useEffect(() => {
    return () => {
      clearDealTimers();
      clearCaptainTimers();
      window.clearTimeout(settleTimer.current);
    };
  }, []);

  function clearDealTimers() {
    dealTimers.current.forEach((timer) => {
      window.clearTimeout(timer);
      window.clearInterval(timer);
    });

    dealTimers.current = [];
  }

  function clearCaptainTimers() {
    window.clearTimeout(captainTimer.current);
    window.clearInterval(captainTicker.current);
  }

  function clearShuffleTimers() {
    clearDealTimers();
    window.clearTimeout(settleTimer.current);
  }

  function resetCaptainState() {
    clearCaptainTimers();
    setCaptains({});
    setActiveCaptainPick(null);
    setIsPickingCaptains(false);
  }

  function handleNamesChange(value) {
    setRawNames(value);
    setCopied(false);
    setLinkCopied(false);
  }

  function updateGroupCount(value) {
    const digitsOnly = value.replace(/\D/g, '');
    setGroupCount(digitsOnly);
    setCopied(false);
    setLinkCopied(false);
  }


  function scrollToTeams() {
    teamsStageRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }

  function randomize() {
    if (!canShuffle || isShuffling || isPickingCaptains) return;

    clearShuffleTimers();
    resetCaptainState();

    const finalGroups = makeGroups(names, validGroupCount);
    const dealOrder = getDealOrder(finalGroups);
    const isMobile = window.matchMedia('(max-width: 960px)').matches;
    const dealGapMs = isMobile ? 500 : DEAL_GAP_MS;

    setGroups(createEmptyGroups(validGroupCount));
    setIsShuffling(true);
    setIsScrambling(true);
    setIsSettling(false);
    setCopied(false);
    setLinkCopied(false);
    setDealCards([]);
    setReceivingTeamIndex(null);
    setLandingMemberKeys([]);

    const scrambleTimer = window.setInterval(() => {
      setScrambledNames((prev) => {
        const newScrambled = {};
        dealOrder.forEach((item) => {
          newScrambled[item.dealId] = getRandomName(names);
        });
        return newScrambled;
      });
      setScrambledTeamNames((prev) => {
        const newScrambled = {...prev};
        Object.keys(prev).forEach(key => {
          newScrambled[key] = getRandomName(names);
        });
        return newScrambled;
      });
    }, 80);

    dealTimers.current.push(scrambleTimer);

    window.setTimeout(() => {
      scrollToTeams();
    }, 120);

    dealOrder.forEach((item, index) => {
      const startDelay = DEAL_START_DELAY_MS + index * dealGapMs;

      const startTimer = window.setTimeout(() => {
        const stageBox = teamsStageRef.current?.getBoundingClientRect();
        const teamBox = teamRefs.current[item.teamIndex]?.getBoundingClientRect();

        let x = 0;
        let y = 220;

        if (stageBox && teamBox) {
          const deckX = stageBox.left + stageBox.width / 2;
          const deckY = stageBox.top + 58;
          const targetX = teamBox.left + teamBox.width / 2;
          const targetY = teamBox.top + Math.min(145, teamBox.height * 0.55);

          x = targetX - deckX;
          y = targetY - deckY;
        }

        const nextCard = {
          ...item,
          x,
          y,
          rotate: item.dealId % 2 === 0 ? 9 : -9,
        };

        setDealCards((prev) => [...prev, nextCard]);
        setReceivingTeamIndex(item.teamIndex);

        const landTimer = window.setTimeout(() => {
          setGroups((prev) => {
            const next = prev.map((team) => [...team]);
            next[item.teamIndex].push(item.name);
            const memberIndex = next[item.teamIndex].length - 1;
            setScrambledTeamNames((prevTeam) => ({
              ...prevTeam,
              [`${item.teamIndex}-${memberIndex}`]: getRandomName(names),
            }));
            return next;
          });

          const landingKey = getMemberAnimationKey(item);

          setLandingMemberKeys((prev) => [
            ...prev.filter((key) => key !== landingKey),
            landingKey,
          ]);

          if (window.matchMedia('(max-width: 960px)').matches) {
            scrollToTeams();
          }

          const removeLandingTimer = window.setTimeout(() => {
            setLandingMemberKeys((prev) =>
              prev.filter((key) => key !== landingKey),
            );
          }, 680);

          dealTimers.current.push(removeLandingTimer);
        }, DEAL_FLIGHT_MS * 0.72);

        const removeCardTimer = window.setTimeout(() => {
          setDealCards((prev) =>
            prev.filter((card) => card.dealId !== item.dealId),
          );
        }, DEAL_FLIGHT_MS + 90);

        dealTimers.current.push(landTimer, removeCardTimer);
      }, startDelay);

      dealTimers.current.push(startTimer);
    });

    const finalTimer = window.setTimeout(() => {
      setDealCards([]);
      setReceivingTeamIndex(null);
      setLandingMemberKeys([]);
      setIsShuffling(false);
      setIsSettling(true);

      settleTimer.current = window.setTimeout(() => {
        setScrambledNames({});
        setScrambledTeamNames({});
        setIsScrambling(false);
        setIsSettling(false);
      }, SETTLE_DURATION_MS);
    }, DEAL_START_DELAY_MS + dealOrder.length * dealGapMs + DEAL_FLIGHT_MS + DEAL_END_DELAY_MS);

    dealTimers.current.push(finalTimer);
  }

  function selectCaptains() {
    if (!canPickCaptains) return;

    clearCaptainTimers();

    setCaptains({});
    setCopied(false);
    setLinkCopied(false);
    setIsPickingCaptains(true);

    window.setTimeout(() => {
      scrollToTeams();
    }, 120);

    let cursor = 0;
    setActiveCaptainPick(memberSlots[0] || null);

    captainTicker.current = window.setInterval(() => {
      cursor = (cursor + 1) % memberSlots.length;
      setActiveCaptainPick(memberSlots[cursor]);
    }, CAPTAIN_ROLL_INTERVAL_MS);

    captainTimer.current = window.setTimeout(() => {
      window.clearInterval(captainTicker.current);

      const nextCaptains = groups.reduce((acc, team, teamIndex) => {
        if (team.length === 0) return acc;

        const memberIndex = Math.floor(Math.random() * team.length);

        acc[teamIndex] = {
          name: team[memberIndex],
          memberIndex,
        };

        return acc;
      }, {});

      setCaptains(nextCaptains);
      setActiveCaptainPick(null);
      setIsPickingCaptains(false);
    }, CAPTAIN_ROLL_DURATION_MS);
  }

  function loadSample() {
    clearShuffleTimers();
    resetCaptainState();

    setRawNames(sampleNames.join('\n'));
    setGroupCount(4);
    setGroups(makeGroups(sampleNames, 4));

    setCopied(false);
    setLinkCopied(false);
    setIsShuffling(false);
    setIsSettling(false);
    setDealCards([]);
    setReceivingTeamIndex(null);
    setLandingMemberKeys([]);
    setScrambledNames({});
    setScrambledTeamNames({});
    setIsScrambling(false);

    window.history.replaceState(null, '', window.location.pathname);
  }

  async function copyTeams() {
    if (!hasTeams) return;

    const text = groups
      .map((team, index) => {
        const captain = captains[index]?.name;
        const heading = captain
          ? `Team ${index + 1} | Captain: ${captain}`
          : `Team ${index + 1}`;

        const members = team
          .map((name) => `- ${name}${name === captain ? ' 👑' : ''}`)
          .join('\n');

        return `${heading}\n${members}`;
      })
      .join('\n\n');

    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setLinkCopied(false);
      setPopupMessage('Teams copied');
      window.setTimeout(() => {
        setCopied(false);
        setPopupMessage('');
      }, 1600);
    } catch {
      setCopied(false);
    }
  }

  async function copyShareLink() {
    if (!hasTeams) return;

    const payload = {
      v: 1,
      createdAt: new Date().toISOString(),
      groups,
      captains,
    };

    const encoded = encodeSharePayload(payload);
    const shareUrl = `${window.location.origin}${window.location.pathname}#teams=${encoded}`;

    try {
      await navigator.clipboard.writeText(shareUrl);
      setLinkCopied(true);
      setCopied(false);
      setPopupMessage('Share link copied');

      window.setTimeout(() => {
        setLinkCopied(false);
        setPopupMessage('');
      }, 1800);
    } catch {
      setLinkCopied(false);
    }
  }

  if (isViewingShared) {
    return (
      <main className="app-shell">
        <div style={{ textAlign: 'center', padding: '2rem' }}>
          <button
            className="primary-action"
            onClick={() => {
              setIsViewingShared(false);
              setRawNames('');
              setGroupCount(1);
              setGroups(createEmptyGroups(1));
              setCaptains({});
              window.history.replaceState(null, '', window.location.pathname);
            }}
          >
            Create new team shuffle
          </button>
        </div>

        <section className="teams-stage" aria-label="Shared teams">
          <div className="teams-grid">
            {groups.map((team, index) => {
              const colors = palette[index % palette.length];
              const captain = captains[index];

              return (
                <article
                  key={`team-${index}`}
                  className={`team-card ${captain ? 'has-captain' : ''}`}
                  style={{
                    '--accent-a': colors[0],
                    '--accent-b': colors[1],
                  }}
                >
                  <div className="team-card-top">
                    <span className="team-number">
                      {String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="team-size">{team.length} members</span>
                  </div>

                  <h3>Team {index + 1}</h3>

                  {captain && (
                    <div className="captain-banner">
                      <Crown size={15} />
                      <span>Captain</span>
                      <strong>{captain.name}</strong>
                    </div>
                  )}

                  <ul>
                    {team.length > 0 ? (
                      team.map((name, memberIndex) => (
                        <li
                          key={`${name}-${memberIndex}`}
                          className="member-row"
                        >
                          <span className="member-name">{name}</span>
                          {captain?.memberIndex === memberIndex && (
                            <span className="captain-badge">
                              <Crown size={12} />
                              Captain
                            </span>
                          )}
                        </li>
                      ))
                    ) : (
                      <li className="empty-slot">Waiting for cards</li>
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

  return (
    <main
      className={`app-shell ${isShuffling ? 'is-shuffling' : ''} ${
        isPickingCaptains ? 'is-picking-captains' : ''
      }`}
    >
      <section className="command-deck">
        <div className="intro">
          <h1>Squad Shuffle</h1>
          <p className="lede">
            Drop in names, choose how many groups you need, and deal everyone
            into balanced teams with a single cosmic roll.
          </p>
        </div>

        <div className="control-panel">
          <label className="field-label" htmlFor="names">
            Names
          </label>

          <textarea
            id="names"
            value={rawNames}
            onChange={(event) => handleNamesChange(event.target.value)}
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
            <button
              className="primary-action"
              onClick={randomize}
              disabled={!canShuffle || isShuffling || isPickingCaptains}
            >
              <Dice5 size={20} />
              {isShuffling ? 'Dealing...' : 'Shuffle Teams'}
            </button>

            <button
              className="captain-action"
              onClick={selectCaptains}
              disabled={!canPickCaptains}
            >
              <Crown size={19} />
              {isPickingCaptains ? 'Picking...' : 'Select Captains'}
            </button>

            <button
              className="icon-action"
              onClick={loadSample}
              aria-label="Reset sample names"
              title="Reset sample names"
              disabled={isShuffling || isPickingCaptains}
            >
              <RotateCcw size={19} />
            </button>

            <button
              className="icon-action"
              onClick={copyTeams}
              aria-label="Copy teams"
              title="Copy teams"
              disabled={!hasTeams || isShuffling}
            >
              <Clipboard size={19} />
            </button>

            <button
              className="icon-action"
              onClick={copyShareLink}
              aria-label="Copy share link"
              title="Copy share link"
              disabled={!hasTeams || isShuffling}
            >
              <Share2 size={19} />
            </button>
          </div>

          <div className="hint-row">
            <ArrowRightLeft size={16} />
            <span>
              {copied
                ? 'Teams copied'
                : linkCopied
                  ? 'Share link copied'
                  : isShuffling
                    ? 'Cards are flying into teams...'
                    : isPickingCaptains
                      ? 'Captain spotlight is rolling...'
                      : isViewingShared
                        ? 'Viewing shared teams - create new teams below'
                        : Object.keys(captains).length > 0
                          ? 'Captains selected'
                          : 'Have fun !'}
            </span>
          </div>
        </div>
      </section>

      <section
        className="teams-stage"
        aria-label="Generated teams"
        ref={teamsStageRef}
      >
        {isShuffling && (
          <div className="shuffle-deck" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        )}

        {dealCards.map((card) => (
          <div
            className="deal-card"
            key={`deal-card-${card.dealId}`}
            style={{
              '--deal-x': `${card.x}px`,
              '--deal-y': `${card.y}px`,
              '--deal-rotate': `${card.rotate}deg`,
            }}
          >
            <small>Team {card.teamIndex + 1}</small>
            <strong>{scrambledNames[card.dealId] || card.name}</strong>
          </div>
        ))}

        <div className="teams-grid">
          {groups.map((team, index) => {
            const colors = palette[index % palette.length];
            const captain = captains[index];

            return (
              <article
                ref={(node) => {
                  teamRefs.current[index] = node;
                }}
                className={`team-card ${captain ? 'has-captain' : ''} ${
                  receivingTeamIndex === index ? 'team-receiving' : ''
                } ${isSettling ? 'slot-settling' : ''}`}
                key={`team-${index}`}
                style={{
                  '--accent-a': colors[0],
                  '--accent-b': colors[1],
                  '--delay': `${index * 70}ms`,
                }}
              >
                <div className="team-card-top">
                  <span className="team-number">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span className="team-size">{team.length} members</span>
                </div>

                <h3>Team {index + 1}</h3>

                {captain && (
                  <div className="captain-banner">
                    <Crown size={15} />
                    <span>Captain</span>
                    <strong>{captain.name}</strong>
                  </div>
                )}

                {isPickingCaptains && !captain && team.length > 0 && (
                  <div className="captain-banner captain-banner-pending">
                    <Crown size={15} />
                    <span>Captain draw in progress</span>
                  </div>
                )}

                <ul>
                  {team.length > 0 ? (
                    team.map((name, memberIndex) => {
                      const isCaptain = captain?.memberIndex === memberIndex;

                      const isCandidate =
                        activeCaptainPick?.teamIndex === index &&
                        activeCaptainPick?.memberIndex === memberIndex;

                      const memberKey = getMemberAnimationKey({
                        teamIndex: index,
                        memberIndex,
                        name,
                      });

                      const isLanding = landingMemberKeys.includes(memberKey);

                      return (
                        <li
                          key={`${name}-${memberIndex}`}
                          className={`member-row ${
                            isCaptain ? 'captain-selected' : ''
                          } ${isCandidate ? 'captain-candidate' : ''} ${
                            isLanding ? 'member-landing' : ''
                          }`}
                        >
                          <span className={`member-name ${isScrambling ? 'scrambling' : ''}`}>{scrambledTeamNames[`${index}-${memberIndex}`] || name}</span>

                          {isCaptain && (
                            <span className="captain-badge">
                              <Crown size={12} />
                              Captain
                            </span>
                          )}

                          {isCandidate && !isCaptain && (
                            <span className="captain-badge rolling-badge">
                              Rolling
                            </span>
                          )}
                        </li>
                      );
                    })
                  ) : (
                    <li className="empty-slot">Waiting for cards</li>
                  )}
                </ul>
              </article>
            );
          })}
        </div>
      </section>

      {popupMessage && (
        <div className="popup-card">
          {popupMessage}
        </div>
      )}
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);