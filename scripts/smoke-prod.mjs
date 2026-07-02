#!/usr/bin/env node

const DEFAULT_API_BASE_URL = 'https://family-vakay-backend.onrender.com';
const DEFAULT_FRONTEND_URL = 'https://family-vakay-frontend.onrender.com';

const config = {
  apiBaseUrl: stripTrailingSlash(process.env.SMOKE_API_BASE_URL || DEFAULT_API_BASE_URL),
  frontendUrl: stripTrailingSlash(process.env.SMOKE_FRONTEND_URL || DEFAULT_FRONTEND_URL),
  firebaseApiKey: process.env.SMOKE_FIREBASE_API_KEY || process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyDcCnHK1nV0F2rYTQesT8a2KleTyzTzOhI',
  adminToken: process.env.SMOKE_ADMIN_TOKEN || '',
  adminEmail: process.env.SMOKE_ADMIN_EMAIL || '',
  adminPassword: process.env.SMOKE_ADMIN_PASSWORD || '',
  memberToken: process.env.SMOKE_MEMBER_TOKEN || '',
  memberEmail: process.env.SMOKE_MEMBER_EMAIL || '',
  memberPassword: process.env.SMOKE_MEMBER_PASSWORD || '',
  memberIsUnregistered: process.env.SMOKE_MEMBER_IS_UNREGISTERED === 'true',
  requestTimeoutMs: Number(process.env.SMOKE_TIMEOUT_MS || 20000),
};

const state = {
  adminToken: '',
  adminUid: '',
  adminProfile: null,
  memberToken: '',
  memberUid: '',
  tripId: '',
  activityId: '',
  rewardId: '',
  inviteId: '',
};

const results = [];

function stripTrailingSlash(value) {
  return value.replace(/\/+$/, '');
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function decodeJwtPayload(token) {
  const payload = token.split('.')[1];
  if (!payload) {
    throw new Error('Token is not a JWT.');
  }
  return JSON.parse(Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64url').toString('utf8'));
}

async function withStep(name, fn, options = {}) {
  const startedAt = Date.now();
  try {
    const value = await fn();
    results.push({ name, status: options.skip ? 'SKIP' : 'PASS', durationMs: Date.now() - startedAt });
    return value;
  } catch (error) {
    results.push({ name, status: options.optional ? 'SKIP' : 'FAIL', durationMs: Date.now() - startedAt, error: error.message });
    if (options.optional) {
      return undefined;
    }
    throw error;
  }
}

async function request(pathOrUrl, options = {}) {
  const url = pathOrUrl.startsWith('http') ? pathOrUrl : `${config.apiBaseUrl}${pathOrUrl}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs);
  const headers = {
    Accept: 'application/json',
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
    const text = await response.text();
    const data = text ? parseBody(text, response.headers.get('content-type')) : null;
    const expectedStatuses = Array.isArray(options.expect) ? options.expect : [options.expect || 200];

    if (!expectedStatuses.includes(response.status)) {
      const detail = typeof data === 'object' && data ? JSON.stringify(data) : text.slice(0, 300);
      throw new Error(`${options.method || 'GET'} ${url} returned ${response.status}, expected ${expectedStatuses.join('/')}: ${detail}`);
    }

    return { response, data, text };
  } finally {
    clearTimeout(timeout);
  }
}

function parseBody(text, contentType = '') {
  if (contentType.includes('application/json')) {
    return JSON.parse(text);
  }
  return text;
}

async function firebaseSignIn(email, password) {
  const { data } = await request(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${config.firebaseApiKey}`, {
    method: 'POST',
    body: {
      email,
      password,
      returnSecureToken: true,
    },
  });
  return {
    token: data.idToken,
    uid: data.localId,
  };
}

async function loadToken(kind) {
  const explicitToken = config[`${kind}Token`];
  if (explicitToken) {
    const payload = decodeJwtPayload(explicitToken);
    return { token: explicitToken, uid: payload.user_id || payload.sub || payload.uid };
  }

  const email = config[`${kind}Email`];
  const password = config[`${kind}Password`];
  if (email && password) {
    return firebaseSignIn(email, password);
  }

  return null;
}

function assertObject(data, label) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error(`${label} was not an object.`);
  }
  return data;
}

async function runPublicChecks() {
  await withStep('backend /health responds', async () => {
    const { data } = await request('/health');
    if (data.status !== 'ok') {
      throw new Error(`/health status was ${data.status}`);
    }
  });

  await withStep('backend /ready checks Firebase and Firestore', async () => {
    const { data } = await request('/ready');
    assertObject(data, '/ready');
    if (data.status !== 'ok') {
      throw new Error(`/ready status was ${data.status}: ${JSON.stringify(data.checks)}`);
    }
  });

  await withStep('backend /version responds', async () => {
    const { data } = await request('/version');
    assertObject(data, '/version');
    if (!data.service || !data.commit) {
      throw new Error(`/version missing service or commit: ${JSON.stringify(data)}`);
    }
  });

  await withStep('frontend production bundle responds', async () => {
    const { response, text } = await request(config.frontendUrl, { expect: 200, headers: { Accept: 'text/html' } });
    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html') || !text.includes('<!DOCTYPE html')) {
      throw new Error('Frontend did not return the exported HTML shell.');
    }
  });

  await withStep('public invite lookup rejects bogus code', async () => {
    await request('/api/v1/family/invites/by-code/not-a-real-smoke-code', { expect: 404 });
  });

  await withStep('protected rewards route rejects anonymous requests', async () => {
    await request('/api/v1/rewards', { expect: 401 });
  });
}

async function runAuthenticatedChecks() {
  const admin = await loadToken('admin');
  if (!admin) {
    results.push({
      name: 'authenticated product smoke paths',
      status: 'SKIP',
      durationMs: 0,
      error: 'Set SMOKE_ADMIN_TOKEN or SMOKE_ADMIN_EMAIL/SMOKE_ADMIN_PASSWORD to run invite, trip, decision, budget, and rewards checks.',
    });
    return;
  }

  state.adminToken = admin.token;
  state.adminUid = admin.uid;

  await withStep('admin profile resolves', async () => {
    const { data } = await request(`/api/v1/users/${state.adminUid}`, { token: state.adminToken });
    state.adminProfile = assertObject(data, 'admin profile');
    if (state.adminProfile.role !== 'admin') {
      throw new Error(`Smoke admin profile role is ${state.adminProfile.role}, expected admin.`);
    }
    if (!state.adminProfile.familyId && !state.adminProfile.family_id) {
      throw new Error('Smoke admin has no family ID.');
    }
  });

  await withStep('family share code resolves to family id', async () => {
    const { data: share } = await request('/api/v1/family/share-code', { token: state.adminToken });
    if (!share.code) {
      throw new Error('Missing family share code.');
    }
    const { data: family } = await request(`/api/v1/family/by-code/${encodeURIComponent(share.code)}`);
    if (!family.familyId) {
      throw new Error('Share code did not resolve to a family ID.');
    }
  });

  await withStep('adult invite create, list, and public resolve', async () => {
    const { data: invite } = await request('/api/v1/family/invites', {
      method: 'POST',
      token: state.adminToken,
      body: {
        recipientName: `Smoke Adult ${nowStamp()}`,
        recipientEmail: `smoke+${Date.now()}@example.com`,
        role: 'member',
      },
      expect: 201,
    });
    state.inviteId = invite.id;
    if (!invite.code || invite.status !== 'pending') {
      throw new Error(`Invite create returned unexpected payload: ${JSON.stringify(invite)}`);
    }

    const { data: invites } = await request('/api/v1/family/invites', { token: state.adminToken });
    if (!Array.isArray(invites) || !invites.some((item) => item.id === invite.id)) {
      throw new Error('Created invite was not present in invite list.');
    }

    const { data: resolved } = await request(`/api/v1/family/invites/by-code/${encodeURIComponent(invite.code)}`);
    if (resolved.familyId !== invite.familyId || resolved.status !== 'pending') {
      throw new Error(`Invite resolve mismatch: ${JSON.stringify(resolved)}`);
    }
  });

  await maybeAcceptInvite();

  await withStep('trip creation and list flow', async () => {
    const start = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const end = new Date(Date.now() + 17 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { data: trip } = await request('/api/v1/trips/', {
      method: 'POST',
      token: state.adminToken,
      body: {
        name: `Smoke Trip ${nowStamp()}`,
        description: 'Automated production smoke test trip.',
        startDate: start,
        endDate: end,
        location: 'Smoke Test City',
        participants: [state.adminUid],
        status: 'upcoming',
        budget: 500,
        tripType: 'standard',
      },
    });
    state.tripId = trip.id;
    if (!state.tripId || trip.ownerId !== state.adminUid) {
      throw new Error(`Trip create returned unexpected payload: ${JSON.stringify(trip)}`);
    }

    const { data: trips } = await request('/api/v1/trips/', { token: state.adminToken });
    if (!Array.isArray(trips) || !trips.some((item) => item.id === state.tripId)) {
      throw new Error('Created trip was not present in trip list.');
    }
  });

  await withStep('suggestion endpoint returns structured ideas or fallback', async () => {
    const { data } = await request(`/api/v1/ai/trips/${state.tripId}/suggest-activity`, {
      method: 'POST',
      token: state.adminToken,
      body: {
        context: 'rainy afternoon with kids',
      },
    });
    if (!Array.isArray(data.suggestions) || data.suggestions.length === 0) {
      throw new Error(`Suggestion response missing suggestions: ${JSON.stringify(data)}`);
    }
  });

  await withStep('activity decision board flow', async () => {
    const { data: activity } = await request('/api/v1/activities/', {
      method: 'POST',
      token: state.adminToken,
      body: {
        name: `Smoke Activity ${nowStamp()}`,
        tripId: state.tripId,
        activityTypes: ['Activities'],
        description: 'Automated smoke activity.',
        location: 'Smoke Pier',
        budget: 75,
        cost: 0,
        budgetCategory: 'Activities',
        isIdea: true,
        isBooked: false,
      },
      expect: 201,
    });
    state.activityId = activity.id;
    if (!state.activityId) {
      throw new Error(`Activity create returned no ID: ${JSON.stringify(activity)}`);
    }

    await request(`/api/v1/activities/${state.activityId}/vote`, {
      method: 'POST',
      token: state.adminToken,
      body: { vote: 'happy' },
    });

    await request(`/api/v1/activities/${state.activityId}`, {
      method: 'PUT',
      token: state.adminToken,
      body: {
        isIdea: false,
        isBooked: true,
        cost: 45,
        amountPaid: 45,
        paymentStatus: 'paid',
        budgetCategory: 'Activities',
      },
    });

    const { data: activities } = await request(`/api/v1/trips/${state.tripId}/activities`, { token: state.adminToken });
    if (!Array.isArray(activities) || !activities.some((item) => item.id === state.activityId)) {
      throw new Error('Created activity was not present in trip activities.');
    }
  });

  await withStep('budget command summary includes smoke trip', async () => {
    const { data } = await request('/api/v1/trips/with-budget-summary', { token: state.adminToken });
    if (!Array.isArray(data) || !data.some((item) => item.id === state.tripId && typeof item.totalSpent === 'number')) {
      throw new Error('Budget summary did not include the smoke trip.');
    }
  });

  await withStep('rewards store create, list, redemptions, update, delete', async () => {
    const { data: reward } = await request('/api/v1/rewards', {
      method: 'POST',
      token: state.adminToken,
      body: {
        title: `Smoke Reward ${nowStamp()}`,
        description: 'Automated smoke reward.',
        pointsCost: 1,
        icon: 'star',
        isActive: true,
      },
      expect: 201,
    });
    state.rewardId = reward.id;
    if (!state.rewardId) {
      throw new Error(`Reward create returned no ID: ${JSON.stringify(reward)}`);
    }

    const { data: rewards } = await request('/api/v1/rewards', { token: state.adminToken });
    if (!Array.isArray(rewards) || !rewards.some((item) => item.id === state.rewardId)) {
      throw new Error('Created reward was not present in rewards list.');
    }

    await request(`/api/v1/rewards/${state.rewardId}`, {
      method: 'PUT',
      token: state.adminToken,
      body: { pointsCost: 2 },
    });

    const { data: redemptions } = await request('/api/v1/rewards/redemptions', { token: state.adminToken });
    if (!Array.isArray(redemptions)) {
      throw new Error('Redemptions response was not a list.');
    }
  });
}

async function maybeAcceptInvite() {
  const member = await loadToken('member');
  if (!member) {
    results.push({
      name: 'invite acceptance with member account',
      status: 'SKIP',
      durationMs: 0,
      error: 'Set SMOKE_MEMBER_TOKEN or SMOKE_MEMBER_EMAIL/SMOKE_MEMBER_PASSWORD plus SMOKE_MEMBER_IS_UNREGISTERED=true to run fresh invite acceptance.',
    });
    return;
  }

  state.memberToken = member.token;
  state.memberUid = member.uid;

  if (!config.memberIsUnregistered) {
    results.push({
      name: 'invite acceptance with member account',
      status: 'SKIP',
      durationMs: 0,
      error: 'SMOKE_MEMBER_IS_UNREGISTERED was not true, avoiding mutation of an existing member profile.',
    });
    return;
  }

  await withStep('invite acceptance registers member into family', async () => {
    const profileCheck = await request(`/api/v1/users/${state.memberUid}`, {
      token: state.memberToken,
      expect: [404],
    });
    if (profileCheck.response.status !== 404) {
      throw new Error('Smoke member already has a profile. Use a fresh disposable account for invite acceptance.');
    }

    const { data: invite } = await request('/api/v1/family/invites', { token: state.adminToken });
    const pending = invite.find((item) => item.id === state.inviteId);
    if (!pending?.code) {
      throw new Error('Pending invite was not available for acceptance.');
    }

    const { data: createdProfile } = await request(`/api/v1/users/${state.memberUid}`, {
      method: 'PUT',
      token: state.memberToken,
      body: {
        name: `Smoke Member ${nowStamp()}`,
        email: config.memberEmail || undefined,
        inviteCode: pending.code,
      },
    });

    const adminFamilyId = state.adminProfile.familyId || state.adminProfile.family_id;
    if (createdProfile.familyId !== adminFamilyId || createdProfile.role !== 'member') {
      throw new Error(`Invite acceptance profile mismatch: ${JSON.stringify(createdProfile)}`);
    }
  });
}

async function cleanup() {
  const cleanupSteps = [];

  if (state.activityId && state.tripId) {
    cleanupSteps.push(['cleanup smoke activity', () => request(`/api/v1/activities/trip/${state.tripId}/activity/${state.activityId}`, {
      method: 'DELETE',
      token: state.adminToken,
      expect: [204],
    })]);
  }

  if (state.rewardId) {
    cleanupSteps.push(['cleanup smoke reward', () => request(`/api/v1/rewards/${state.rewardId}`, {
      method: 'DELETE',
      token: state.adminToken,
      expect: [204, 404],
    })]);
  }

  if (state.tripId) {
    cleanupSteps.push(['cleanup smoke trip', () => request(`/api/v1/trips/${state.tripId}`, {
      method: 'DELETE',
      token: state.adminToken,
      expect: [204],
    })]);
  }

  if (state.inviteId) {
    cleanupSteps.push(['revoke unused smoke invite', () => request(`/api/v1/family/invites/${state.inviteId}/revoke`, {
      method: 'POST',
      token: state.adminToken,
      expect: [200, 400],
    })]);
  }

  for (const [name, fn] of cleanupSteps) {
    await withStep(name, fn, { optional: true });
  }
}

function printSummary() {
  const statusWidth = 5;
  for (const result of results) {
    const status = result.status.padEnd(statusWidth);
    const duration = `${result.durationMs}ms`.padStart(7);
    const suffix = result.error ? ` - ${result.error}` : '';
    console.log(`${status} ${duration} ${result.name}${suffix}`);
  }
}

async function main() {
  console.log(`Family Vakay production smoke test`);
  console.log(`API: ${config.apiBaseUrl}`);
  console.log(`Frontend: ${config.frontendUrl}`);
  console.log('');

  let failed = false;
  try {
    await runPublicChecks();
    await runAuthenticatedChecks();
  } catch (error) {
    failed = true;
    console.error(`\nSmoke test failed: ${error.message}`);
  } finally {
    if (state.adminToken) {
      await cleanup();
    }
    console.log('');
    printSummary();
  }

  const failedCount = results.filter((result) => result.status === 'FAIL').length;
  if (failed || failedCount > 0) {
    process.exit(1);
  }

  const skipped = results.filter((result) => result.status === 'SKIP').length;
  if (skipped > 0) {
    console.log(`\nSmoke finished with ${skipped} skipped credential-gated check(s).`);
  } else {
    console.log('\nSmoke passed.');
  }
}

main();
