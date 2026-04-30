import { describe, expect, it } from 'vitest';

import { redactSecrets } from '../../src/redactors/secrets.js';

describe('redactSecrets', () => {
  it('redacts Anthropic API keys', () => {
    const out = redactSecrets('my key is sk-ant-api03-abcdefghij1234567890xyz done.');
    expect(out.text).toContain('<REDACTED:anthropic>');
    expect(out.byType.anthropic).toBe(1);
  });

  it('redacts GitHub classic PATs', () => {
    const token = `ghp_${'a'.repeat(36)}`;
    const out = redactSecrets(`token=${token} end`);
    expect(out.text).toContain('<REDACTED:github-classic>');
    expect(out.byType['github-classic']).toBe(1);
  });

  it('redacts fine-grained GitHub tokens', () => {
    const token = `github_pat_${'x'.repeat(22)}`;
    const out = redactSecrets(`pat=${token} end`);
    expect(out.text).toContain('<REDACTED:github-fine>');
  });

  it('redacts AWS access keys', () => {
    const out = redactSecrets('AWS_ACCESS_KEY_ID=AKIA0123456789ABCDEF ok');
    expect(out.text).toContain('<REDACTED:aws-access-key>');
    expect(out.byType['aws-access-key']).toBe(1);
  });

  it('redacts Google API keys', () => {
    const key = `AIza${'a'.repeat(35)}`;
    const out = redactSecrets(`google_key=${key} done`);
    expect(out.text).toContain('<REDACTED:google-api>');
    expect(out.byType['google-api']).toBe(1);
  });

  it('redacts Stripe live and test keys', () => {
    const out = redactSecrets(
      `stripe live: sk_live_${'a'.repeat(24)} test: pk_test_${'b'.repeat(24)} restricted: rk_live_${'c'.repeat(24)}`,
    );
    expect(out.byType.stripe).toBe(3);
  });

  it('redacts Slack tokens (bot, user, app)', () => {
    const out = redactSecrets(
      `bot: xoxb-${'a'.repeat(20)} user: xoxp-${'b'.repeat(20)} app: xoxa-${'c'.repeat(20)}`,
    );
    expect(out.byType.slack).toBe(3);
  });

  it('redacts NPM tokens', () => {
    const token = `npm_${'a'.repeat(36)}`;
    const out = redactSecrets(`token=${token} end`);
    expect(out.text).toContain('<REDACTED:npm>');
  });

  it('redacts a PEM-encoded private key block', () => {
    const pem = [
      '-----BEGIN RSA PRIVATE KEY-----',
      'MIIEpAIBAAKCAQEA0Z9mnopq',
      'random base64-looking stuff that should be swallowed',
      '-----END RSA PRIVATE KEY-----',
    ].join('\n');
    const out = redactSecrets(`Here is the key:\n${pem}\nDone.`);
    expect(out.text).toContain('<REDACTED:pem-private-key>');
    expect(out.text).not.toContain('MIIEpAIBAAKCAQEA');
    expect(out.byType['pem-private-key']).toBe(1);
  });

  it('reports zero when nothing matches', () => {
    const out = redactSecrets('plain prose without secrets');
    expect(out.redactedCount).toBe(0);
    expect(out.text).toBe('plain prose without secrets');
  });

  it('redacts OpenAI service-account keys', () => {
    const key = `sk-svcacct-${'a'.repeat(40)}`;
    const out = redactSecrets(`x ${key} y`);
    expect(out.text).toContain('<REDACTED:openai>');
  });

  it('redacts OpenAI admin keys', () => {
    const key = `sk-admin-${'b'.repeat(40)}`;
    const out = redactSecrets(`x ${key} y`);
    expect(out.text).toContain('<REDACTED:openai>');
  });

  it('redacts AWS STS session keys', () => {
    const out = redactSecrets('session=ASIA0123456789ABCDEF end');
    expect(out.text).toContain('<REDACTED:aws-session-key>');
  });

  it('redacts DigitalOcean PATs', () => {
    const token = `dop_v1_${'a'.repeat(64)}`;
    const out = redactSecrets(`do=${token}`);
    expect(out.text).toContain('<REDACTED:digitalocean>');
  });

  it('redacts Twilio account SIDs', () => {
    const out = redactSecrets(`twilio AC${'1'.repeat(32)} ok`);
    expect(out.text).toContain('<REDACTED:twilio-sid>');
  });

  it('redacts Mailgun keys', () => {
    const out = redactSecrets(`key-${'a'.repeat(32)} end`);
    expect(out.text).toContain('<REDACTED:mailgun>');
  });

  it('redacts SendGrid API keys', () => {
    const out = redactSecrets(`SG.${'a'.repeat(22)}.${'b'.repeat(43)} end`);
    expect(out.text).toContain('<REDACTED:sendgrid>');
  });

  it('redacts Discord bot tokens', () => {
    const token = `M${'a'.repeat(23)}.${'b'.repeat(6)}.${'c'.repeat(38)}`;
    const out = redactSecrets(`bot=${token} end`);
    expect(out.text).toContain('<REDACTED:discord-bot>');
  });

  it('redacts MongoDB Atlas connection strings with embedded password', () => {
    const out = redactSecrets('mongodb+srv://admin:s3cr3t@cluster0.mongodb.net/db');
    expect(out.text).toContain('<REDACTED:mongodb-uri>');
  });

  it('redacts Slack app tokens', () => {
    const token = `xapp-1-${'A'.repeat(11)}-${'1'.repeat(10)}-${'b'.repeat(40)}`;
    const out = redactSecrets(`slack=${token} end`);
    expect(out.text).toContain('<REDACTED:slack-app>');
  });
});
