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
    if (translation) return translation;

    const fallbackMessages = {
      arena_already_registered: {
        vi: 'Tên Minecraft này đã có đơn đăng ký. Vui lòng kiểm tra trạng thái hoặc liên hệ quản trị viên.',
        en: 'A registration already exists for this Minecraft username. Check its status or contact an administrator.'
      },
      arena_duplicate: {
        vi: 'Tên Minecraft này đã có hồ sơ đăng ký. Vui lòng liên hệ quản trị viên để được hỗ trợ.',
        en: 'A registration already exists for this Minecraft username. Contact an administrator for help.'
      },
      arena_existing_pending: {
        vi: 'Đơn đăng ký đã được tiếp nhận và đang chờ quản trị viên duyệt. Bạn không cần gửi lại.',
        en: 'Your registration has been received and is awaiting administrator review. You do not need to submit it again.'
      },
      arena_existing_approved: {
        vi: 'Tên Minecraft này đã được quản trị viên duyệt; không thể đăng ký thêm.',
        en: 'This Minecraft username has already been approved; another registration is not allowed.'
      },
      arena_existing_rejected: {
        vi: 'Đơn đăng ký trước đã bị từ chối. Vui lòng liên hệ quản trị viên nếu cần được xem xét lại.',
        en: 'The previous registration was rejected. Contact an administrator if you would like it reviewed.'
      },
      arena_required_minecraft: {
        vi: 'Vui lòng nhập tên Minecraft.',
        en: 'Please enter your Minecraft username.'
      },
      arena_required_discord: {
        vi: 'Vui lòng nhập tên người dùng Discord.',
        en: 'Please enter your Discord username.'
      },
      arena_required_phone: {
        vi: 'Vui lòng nhập số điện thoại liên hệ.',
        en: 'Please enter a contact phone number.'
      },
      arena_phone_invalid: {
        vi: 'Số điện thoại chưa đúng định dạng. Hãy kiểm tra và nhập lại.',
        en: 'The phone number format is invalid. Check it and try again.'
      }
    };
    return fallbackMessages[key]?.[language] || (
      language === 'en'
        ? 'We could not complete this request. Please try again or contact an administrator.'
        : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại hoặc liên hệ quản trị viên.'
    );
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

  async function findExistingRegistration(username) {
    if (registrationLookupAvailable !== false) {
      try {
        const matches = await supabaseRequest('rpc/lookup_arena_registration_team', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_minecraft_username: username })
        });
        registrationLookupAvailable = true;
        return matches[0] || null;
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

  function setExistingRegistrationMessage(registration) {
    const statusMessage = {
      PENDING: 'arena_existing_pending',
      APPROVED: 'arena_existing_approved',
      REJECTED: 'arena_existing_rejected'
    }[registration?.status];

    if (!statusMessage) {
      setFeedback('arena_duplicate');
      return;
    }

    setFeedback(statusMessage, registration.team_name);
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
        approvedTeamByUsername.set(registration.minecraft_username.trim().toLowerCase(), {
          team_name: teamName,
          status: 'APPROVED'
        });
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

  document.addEventListener('app-language-changed', renderLocalizedState);
  phoneInput.addEventListener('input', () => {
    if (validatePhoneNumber() && feedbackState?.key === 'arena_phone_invalid') {
      setFeedback(null);
    }
  });
  phoneInput.addEventListener('blur', () => validatePhoneNumber());
  form.addEventListener('input', (event) => {
    const fieldForMessage = {
      arena_required_minecraft: 'arenaMinecraftUsername',
      arena_required_discord: 'arenaDiscordUsername',
      arena_required_phone: 'arenaPhoneNumber'
    }[feedbackState?.key];

    if (fieldForMessage === event.target.id && event.target.value.trim()) {
      setFeedback(null);
    }
  });

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
    const requiredField = !registration.minecraft_username
      ? { input: document.getElementById('arenaMinecraftUsername'), message: 'arena_required_minecraft' }
      : !registration.discord_username
        ? { input: document.getElementById('arenaDiscordUsername'), message: 'arena_required_discord' }
        : !registration.phone_number
          ? { input: document.getElementById('arenaPhoneNumber'), message: 'arena_required_phone' }
          : null;

    if (requiredField) {
      setFeedback(requiredField.message);
      requiredField.input.focus();
      return;
    }

    const normalizedPhoneNumber = validatePhoneNumber();
    if (!normalizedPhoneNumber) {
      setFeedback('arena_phone_invalid');
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
      const existingRegistration = await findExistingRegistration(registration.minecraft_username);
      if (existingRegistration) {
        setExistingRegistrationMessage(existingRegistration);
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
          setExistingRegistrationMessage(
            await findExistingRegistration(registration.minecraft_username),
          );
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
