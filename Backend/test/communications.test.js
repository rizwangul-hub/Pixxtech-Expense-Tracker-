import assert from 'node:assert/strict';
import test from 'node:test';
import {
  CommunicationError,
  getCallTransition,
  getConversationContext,
  getIceServers,
  resolveConfiguredParticipants,
  validateAttachmentFile,
  validateMessageInput,
  validateSignalInput,
} from '../services/communicationService.js';

const admin = { _id: 'admin-1', email: 'ADMIN@example.com ', name: 'Khurshid', role: 'ADMIN', isActive: true };
const dataEntry = { _id: 'entry-2', email: 'entry@example.com', name: 'Sarfraz', role: 'DATA_ENTRY', isActive: true };

test('participant resolution is exact, normalized, and fail-closed', () => {
  assert.deepEqual(
    resolveConfiguredParticipants(
      { adminEmail: ' admin@example.com ', dataEntryEmail: 'ENTRY@example.com' },
      [admin, dataEntry]
    ),
    [admin, dataEntry]
  );
  assert.throws(
    () => resolveConfiguredParticipants({ adminEmail: '', dataEntryEmail: 'entry@example.com' }, [admin, dataEntry]),
    (error) => error instanceof CommunicationError && error.status === 503
  );
  assert.throws(
    () => resolveConfiguredParticipants(
      { adminEmail: 'admin@example.com', dataEntryEmail: 'entry@example.com' },
      [{ ...admin, role: 'ADMIN_PUBLISHER' }, dataEntry]
    ),
    (error) => error.code === 'COMMUNICATION_CONFIG_ERROR'
  );
  assert.throws(
    () => getConversationContext([admin, dataEntry], 'someone-else'),
    (error) => error.status === 403
  );
  assert.equal(
    getConversationContext([admin, dataEntry], 'admin-1').channelName,
    getConversationContext([dataEntry, admin], 'entry-2').channelName
  );
});

test('message request validation constrains type, IDs, and lengths', () => {
  assert.deepEqual(validateMessageInput({ clientMessageId: 'client-1', type: 'TEXT', text: ' hello ' }), {
    clientMessageId: 'client-1',
    type: 'TEXT',
    text: 'hello',
    attachmentId: null,
  });
  assert.throws(() => validateMessageInput({ clientMessageId: 'x', type: 'TEXT' }), CommunicationError);
  assert.throws(() => validateMessageInput({ clientMessageId: 'x', type: 'VIDEO' }), CommunicationError);
  assert.throws(
    () => validateMessageInput({ clientMessageId: 'x', type: 'IMAGE', attachmentId: 'a', text: 'x'.repeat(1001) }),
    CommunicationError
  );
});

test('attachment validation verifies both limits and file signatures', () => {
  assert.equal(
    validateAttachmentFile({
      originalname: 'test.PNG',
      mimetype: 'image/png',
      size: 8,
      buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    }).resourceType,
    'image'
  );
  assert.throws(
    () =>
      validateAttachmentFile({
        originalname: 'disguised.jpg',
        mimetype: 'image/jpeg',
        size: 4,
        buffer: Buffer.from('not an image'),
      }),
    CommunicationError
  );
  assert.throws(
    () =>
      validateAttachmentFile({
        originalname: 'too-large.png',
        mimetype: 'image/png',
        size: 10 * 1024 * 1024 + 1,
        buffer: Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      }),
    (error) => error.status === 413
  );
});

test('call transitions enforce actor and state rules', () => {
  const ringing = { caller: 'admin-1', callee: 'entry-2', status: 'RINGING', startedAt: null };
  assert.equal(getCallTransition(ringing, 'entry-2', 'accept').status, 'ACCEPTED');
  assert.throws(() => getCallTransition(ringing, 'admin-1', 'accept'), (error) => error.status === 409);
  assert.throws(() => getCallTransition(ringing, 'entry-2', 'cancel'), (error) => error.status === 409);
  assert.throws(
    () => getCallTransition({ ...ringing, status: 'DECLINED' }, 'entry-2', 'accept'),
    (error) => error.status === 409
  );
});

test('signaling input is bounded and TURN configuration fails closed', () => {
  assert.equal(validateSignalInput({ kind: 'ice-candidate', payload: { candidate: 'candidate' } }).kind, 'ice-candidate');
  assert.throws(
    () => validateSignalInput({ kind: 'offer', payload: { sdp: 'x'.repeat(16 * 1024) } }),
    (error) => error.status === 413
  );
  assert.deepEqual(getIceServers({}), [{ urls: ['stun:stun.l.google.com:19302'] }]);
  assert.throws(
    () => getIceServers({ TURN_URLS: 'turn:turn.example.com:3478' }),
    (error) => error.status === 503
  );
  assert.deepEqual(
    getIceServers({
      TURN_URLS: 'turns:turn.example.com:5349',
      TURN_USERNAME: 'temporary',
      TURN_CREDENTIAL: 'credential',
    })[0].urls,
    ['turns:turn.example.com:5349']
  );
});
