(function () {
  const config = window.ARENA_SUPABASE_CONFIG || {};
  const form = document.getElementById('arenaRegistrationForm');
  const submitButton = document.getElementById('arenaRegistrationSubmit');
  const teamInput = document.getElementById('arenaTeamSelect');
  const connectionStatus = document.getElementById('arenaConnectionStatus');
  const feedback = document.getElementById('arenaRegistrationFeedback');
  const phoneInput = document.getElementById('arenaPhoneNumber');
  const phoneFeedback = document.getElementById('arenaPhoneFeedback');
  const registrationDialog = document.getElementById('arenaRegistrationDialog');
  const registrationTeam = document.getElementById('arenaRegistrationTeam');
  const teamMemberElements = document.querySelectorAll('[data-team-code]');
  const teamRegisterButtons = document.querySelectorAll('[data-register-team-code]');
  const refreshInterval = 60000;
  let teamsByCode = new Map();
  let connectionState = 'arena_loading';
  let feedbackState = null;
  let selectedTeamId = null;
  let approvedTeamByUsername = new Map();
  let registrationLookupAvailable = null;

  function text(key) {
    const language = document.documentElement.lang === 'en' ? 'en' : 'vi';
    const translation = window.ARENA_I18N?.[language]?.[key];
    return translation || key;
  }

  function setFeedback(key, teamName) {
    feedbackState = key ? { key, teamName } : null;
    if (!feedbackState) {
      feedback.textContent = '';
      return;
    }

    feedback.textContent = text(key).replace('{team}', teamName || '');
  }

  function renderLocalizedState() {
    connectionStatus.textContent = text(connectionState);
    registrationDialog
      .querySelector('[data-close-arena-registration]')
      .setAttribute('aria-label', text('arena_close'));

    if (selectedTeamId !== null) {
      const team = [...teamsByCode.values()].find((entry) => entry.id === selectedTeamId);
      if (team) registrationTeam.textContent = `${text('arena_team_prefix')}${team.team_name}`;
    }

    if (feedbackState) setFeedback(feedbackState.key, feedbackState.teamName);
    validatePhoneNumber(false);
  }

  function normalizePhoneNumber(value) {
    let normalized = value.replace(/[()\s.-]/g, '');
    if (normalized.startsWith('00')) normalized = `+${normalized.slice(2)}`;

    if (/^0\d{9}$/.test(normalized)) {
      normalized = `+84${normalized.slice(1)}`;
    }

    if (/^\+84\d{9}$/.test(normalized) || /^\+[1-9]\d{7,14}$/.test(normalized)) {
      return normalized;
    }

    return null;
  }

  function validatePhoneNumber(showValidMessage = true) {
    const rawValue = phoneInput.value.trim();
    const normalized = rawValue ? normalizePhoneNumber(rawValue) : null;
    const invalid = rawValue.length > 0 && !normalized;

    phoneInput.setCustomValidity(invalid ? text('arena_phone_invalid') : '');
    phoneInput.setAttribute('aria-invalid', String(invalid));
    phoneFeedback.textContent = invalid
      ? text('arena_phone_invalid')
      : normalized && showValidMessage
        ? text('arena_phone_valid')
        : '';
    phoneFeedback.classList.toggle('is-invalid', invalid);
    phoneFeedback.classList.toggle('is-valid', Boolean(normalized) && showValidMessage);

    return normalized;
  }

  function getSupabaseBaseUrl() {
    if (!config.url || !config.anonKey) return null;

    let parsedUrl;
    try {
      parsedUrl = new URL(config.url);
    } catch {
      throw new Error('Supabase URL is invalid.');
    }

    if (parsedUrl.protocol !== 'https:' && parsedUrl.hostname !== 'localhost') {
      throw new Error('Supabase URL must use HTTPS.');
    }

    return parsedUrl.href.replace(/\/+$/, '');
  }

  async function supabaseRequest(path, options) {
    const response = await fetch(`${getSupabaseBaseUrl()}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: config.anonKey,
        Authorization: `Bearer ${config.anonKey}`,
        ...(options && options.headers)
      }
    });

    if (!response.ok) {
      const body = await response.text();
      const error = new Error(`Supabase request failed (${response.status}).`);
      error.code = response.status;
      error.details = body;
      try {
        error.databaseCode = JSON.parse(body).code;
      } catch {
        error.databaseCode = null;
      }
      throw error;
    }

    const body = await response.text();
    return body ? JSON.parse(body) : null;
  }

  async function findRegisteredTeam(username) {
    if (registrationLookupAvailable !== false) {
      try {
        const matches = await supabaseRequest('rpc/lookup_arena_registration_team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_minecraft_username: username })
        });
        registrationLookupAvailable = true;
        return matches[0]?.team_name || null;
      } catch (error) {
        if (error.databaseCode !== 'PGRST202') throw error;
        registrationLookupAvailable = false;
        console.warn(
          'Arena War duplicate lookup RPC is unavailable; falling back to approved registrations and the database unique constraint.',
        );
      }
    }

    return approvedTeamByUsername.get(username.trim().toLowerCase()) || null;
  }

  function setAlreadyRegisteredMessage(teamName) {
    setFeedback(teamName ? 'arena_already_registered' : 'arena_duplicate', teamName);
  }

  function setTeams(teams) {
    teamsByCode = new Map(teams.map((team) => [team.team_code, team]));
    teamRegisterButtons.forEach((button) => {
      button.disabled = !teamsByCode.has(button.dataset.registerTeamCode);
    });
  }

  function displayApprovedMembers(teams, registrations) {
    const teamsById = new Map(teams.map((team) => [String(team.id), team.team_code]));
    const teamNamesById = new Map(teams.map((team) => [String(team.id), team.team_name]));
    const membersByCode = new Map(teams.map((team) => [team.team_code, []]));
    approvedTeamByUsername = new Map();

    registrations.forEach((registration) => {
      const teamCode = teamsById.get(String(registration.team_id));
      const members = membersByCode.get(teamCode);
      if (members) members.push(registration.minecraft_username);
      const teamName = teamNamesById.get(String(registration.team_id));
      if (teamName) {
        approvedTeamByUsername.set(
          registration.minecraft_username.trim().toLowerCase(),
          teamName,
        );
      }
    });

    teamMemberElements.forEach((element) => {
      const members = membersByCode.get(element.dataset.teamCode) || [];
      element.textContent = members.length ? members.join(', ') : text('arena_no_members');
    });
  }

  async function loadArenaData() {
    const query = new URLSearchParams({
      select: 'minecraft_username,team_id',
      status: 'eq.APPROVED',
      order: 'created_at.asc'
    });
    const [teams, approvedRegistrations] = await Promise.all([
      supabaseRequest('arena_teams?select=id,team_code,team_name&order=id.asc', { method: 'GET' }),
      supabaseRequest(`arena_registrations?${query}`, { method: 'GET' })
    ]);

    setTeams(teams);
    displayApprovedMembers(teams, approvedRegistrations);
  }

  teamRegisterButtons.forEach((button) => {
    button.disabled = true;
    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const team = teamsByCode.get(button.dataset.registerTeamCode);
      if (!team || !registrationDialog.showModal) return;

      selectedTeamId = team.id;
      teamInput.value = String(team.id);
      registrationTeam.textContent = `${text('arena_team_prefix')}${team.team_name}`;
      setFeedback(null);
      registrationDialog.showModal();
      document.getElementById('arenaMinecraftUsername').focus();
    });
  });

  registrationDialog.querySelector('[data-close-arena-registration]').addEventListener('click', () => {
    registrationDialog.close();
  });

  registrationDialog.addEventListener('click', (event) => {
    if (event.target === registrationDialog) registrationDialog.close();
  });

  document.addEventListener('app-language-changed', renderLocalizedState);
  phoneInput.addEventListener('input', () => validatePhoneNumber());
  phoneInput.addEventListener('blur', () => validatePhoneNumber());

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    setFeedback(null);

    const formData = new FormData(form);
    const registration = {
      minecraft_username: String(formData.get('minecraft_username')).trim(),
      discord_username: String(formData.get('discord_username')).trim(),
      phone_number: String(formData.get('phone_number')).trim(),
      team_id: Number(formData.get('team_id')),
      status: 'PENDING'
    };

    const selectedTeam = [...teamsByCode.values()].find((team) => team.id === registration.team_id);
    const missingField = !registration.minecraft_username
      ? document.getElementById('arenaMinecraftUsername')
      : !registration.discord_username
        ? document.getElementById('arenaDiscordUsername')
        : !registration.phone_number
          ? document.getElementById('arenaPhoneNumber')
          : null;

    if (missingField) {
      setFeedback('arena_required_fields');
      missingField.focus();
      return;
    }

    const normalizedPhoneNumber = validatePhoneNumber();
    if (!normalizedPhoneNumber) {
      phoneInput.focus();
      return;
    }
    registration.phone_number = normalizedPhoneNumber;

    if (!selectedTeam) {
      setFeedback('arena_team_required');
      return;
    }

    form.dataset.submitting = 'true';
    submitButton.disabled = true;
    setFeedback('arena_sending');

    try {
      const registeredTeam = await findRegisteredTeam(registration.minecraft_username);
      if (registeredTeam) {
        setAlreadyRegisteredMessage(registeredTeam);
        return;
      }

      await supabaseRequest('arena_registrations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Prefer: 'return=minimal'
        },
        body: JSON.stringify(registration)
      });
      form.reset();
      teamInput.value = String(registration.team_id);
      setFeedback('arena_sent');
    } catch (error) {
      console.error('Arena War registration failed:', error);
      if (error.code === 409 || error.databaseCode === '23505') {
        try {
          setAlreadyRegisteredMessage(await findRegisteredTeam(registration.minecraft_username));
        } catch (lookupError) {
          console.error('Could not look up the existing Arena War registration:', lookupError);
          setFeedback('arena_duplicate');
        }
      } else {
        setFeedback('arena_submit_error');
      }
    } finally {
      delete form.dataset.submitting;
      submitButton.disabled = false;
    }
  });

  async function refreshArenaData() {
    try {
      await loadArenaData();
      connectionState = 'arena_connected';
      renderLocalizedState();
    } catch (error) {
      console.error('Arena War data request failed:', error);
      connectionState = 'arena_load_error';
      renderLocalizedState();
      teamRegisterButtons.forEach((button) => {
        button.disabled = true;
      });
    }
  }

  if (!config.url || !config.anonKey) {
    connectionState = 'arena_config_missing';
    renderLocalizedState();
    return;
  }

  renderLocalizedState();
  refreshArenaData();
  window.setInterval(() => {
    if (!document.hidden) refreshArenaData();
  }, refreshInterval);
})();
