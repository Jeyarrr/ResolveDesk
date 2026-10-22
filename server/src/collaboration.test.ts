import { beforeAll, beforeEach, afterAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { lifecycleTestDatabase } from './test/local-postgres.js';
import { createApp } from './app.js';
import { attachments, categories, comments, tickets, users, type Actor } from './db/schema.js';
import { attachmentService } from './services/attachments.js';
import { localStorage, type PrivateStorage } from './services/storage.js';
import { validateFile } from './services/upload.js';

let fixture: Awaited<ReturnType<typeof lifecycleTestDatabase>>;
let app: ReturnType<typeof createApp>;
type Client = { http: ReturnType<typeof request.agent>; csrf: string; id: string };
let admin: Client, agent: Client, employee: Client, otherAgent: Client;
let directory: string, ticketId: string, categoryId: string, employeeActor: Actor;
const origin = 'http://127.0.0.1:5173';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aV1cAAAAASUVORK5CYII=',
  'base64',
);
async function login(email: string, password: string): Promise<Client> {
  const http = request.agent(app),
    pre = await http.get('/api/auth/csrf');
  const r = await http
    .post('/api/auth/login')
    .set('Origin', origin)
    .set('X-CSRF-Token', pre.body.data.csrfToken)
    .send({ email, password });
  expect(r.status).toBe(200);
  return { http, csrf: r.body.data.csrfToken, id: r.body.data.user.id };
}
const post = (c: Client, path: string, body: object) =>
  c.http
    .post('/api' + path)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send(body);
const fileRequest = (c: Client, suffix = '/attachments', id = randomUUID()) =>
  c.http
    .post(`/api/tickets/${ticketId}${suffix}`)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .field('submissionId', id);
const upload = (c: Client, internal = false, id = randomUUID()) =>
  fileRequest(c, '/attachments', id)
    .field('isInternal', String(internal))
    .attach('files', png, { filename: 'screenshot.png', contentType: 'image/png' });
const remove = (c: Client, id: string) =>
  c.http
    .delete('/api/attachments/' + id)
    .set('Origin', origin)
    .set('X-CSRF-Token', c.csrf)
    .send({});
const comment = (c: Client, message: string, isInternal = false) =>
  post(c, `/tickets/${ticketId}/comments`, { message, isInternal, submissionId: randomUUID() });
const state = async (c: Client) =>
  (await c.http.get(`/api/tickets/${ticketId}/conversation-state`)).body.data;
beforeAll(async () => {
  fixture = await lifecycleTestDatabase();
  directory = await mkdtemp(join(tmpdir(), 'resolvedesk-upload-test-'));
  app = createApp(fixture.db, {
    ...fixture.config,
    UPLOAD_DIR: directory,
    UPLOAD_MAX_FILE_BYTES: 1024,
    UPLOAD_MAX_REQUEST_BYTES: 20000,
  });
  admin = await login('admin@resolvedesk.example', fixture.secrets.SEED_ADMIN_PASSWORD);
  agent = await login('agent@resolvedesk.example', fixture.secrets.SEED_AGENT_PASSWORD);
  employee = await login('employee@resolvedesk.example', fixture.secrets.SEED_EMPLOYEE_PASSWORD);
  [employeeActor] = (await fixture.db.select().from(users).where(eq(users.id, employee.id))) as [
    Actor,
  ];
  const [row] = await fixture.db
    .insert(users)
    .values({
      fullName: 'Other support agent',
      email: `${randomUUID()}@example.com`,
      role: 'agent',
      accountStatus: 'active',
      passwordHash: employeeActor.passwordHash,
    })
    .returning();
  otherAgent = await login(row!.email, fixture.secrets.SEED_EMPLOYEE_PASSWORD);
  categoryId = (await fixture.db.select().from(categories))[0]!.id;
}, 60000);
beforeEach(async () => {
  const [ticket] = await fixture.db
    .insert(tickets)
    .values({
      subject: 'Printer support verification',
      description: 'The office printer disconnects repeatedly while printing.',
      categoryId,
      requesterId: employee.id,
      assignedAgentId: agent.id,
    })
    .returning();
  ticketId = ticket!.id;
});
afterAll(async () => {
  await fixture?.engine.close();
});

describe('private attachments and atomic submissions', () => {
  it('uploads real content, returns safe metadata, and downloads through an authorized endpoint', async () => {
    const r = await upload(employee);
    expect(r.status).toBe(201);
    expect(r.body.data).toHaveLength(1);
    const a = r.body.data[0];
    expect(a).toMatchObject({
      originalFilename: 'screenshot.png',
      mimeType: 'image/png',
      fileSize: png.length,
      uploadedBy: employee.id,
      canDelete: true,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/storageKey|storage_key|passwordHash|tokenHash/);
    const download = await agent.http.get(`/api/attachments/${a.id}/download`);
    expect(download.status).toBe(200);
    expect(download.body).toEqual(png);
    expect(download.headers['content-disposition']).toContain('attachment;');
    expect(download.headers['x-content-type-options']).toBe('nosniff');
    const [stored] = await fixture.db.select().from(attachments).where(eq(attachments.id, a.id));
    expect(stored!.storageKey).not.toContain('screenshot');
    expect(await localStorage({ UPLOAD_DIR: directory }).get(stored!.storageKey)).toEqual(png);
    expect((await otherAgent.http.get(`/api/attachments/${a.id}/download`)).status).toBe(404);
    expect((await request(app).get(`/api/attachments/${a.id}/download`)).status).toBe(401);
  });
  it('creates a ticket with its file in one submission and replays retries without duplicates', async () => {
    const id = randomUUID();
    const submit = () =>
      employee.http
        .post('/api/tickets')
        .set('Origin', origin)
        .set('X-CSRF-Token', employee.csrf)
        .field('submissionId', id)
        .field('subject', 'Printer screenshot evidence')
        .field('description', 'Printer cannot connect to the office wireless network.')
        .field('categoryId', categoryId)
        .attach('files', png, 'printer.png');
    const [a, b] = await Promise.all([submit(), submit()]);
    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.data.id).toBe(b.body.data.id);
    const rows = await fixture.db
      .select()
      .from(attachments)
      .where(eq(attachments.ticketId, a.body.data.id));
    expect(rows).toHaveLength(1);
  });
  it('accepts a file exactly at the configured size limit', async () => {
    const result = await fileRequest(employee).attach(
      'files',
      Buffer.alloc(1024, 65),
      'boundary.txt',
    );
    expect(result.status).toBe(201);
    expect(result.body.data[0].fileSize).toBe(1024);
  });
  it('rejects unsupported, disguised, empty, oversized and excess files without writing objects', async () => {
    const before = await readdir(directory);
    for (const [name, content] of [
      ['bad.svg', Buffer.from('<svg/>')],
      ['fake.png', Buffer.from('not an image')],
      ['empty.txt', Buffer.alloc(0)],
      ['large.txt', Buffer.alloc(1025, 65)],
    ] as const) {
      const r = await fileRequest(employee).attach('files', content, name);
      expect([400, 413]).toContain(r.status);
    }
    let many = fileRequest(employee);
    for (let i = 0; i < 6; i++) many = many.attach('files', png, `${i}.png`);
    expect((await many).status).toBe(413);
    expect(await readdir(directory)).toEqual(before);
    expect(
      await fixture.db.select().from(attachments).where(eq(attachments.ticketId, ticketId)),
    ).toHaveLength(0);
  });
  it('rejects malformed multipart, oversized requests, missing CSRF and mass assignment', async () => {
    expect(
      (
        await employee.http
          .post(`/api/tickets/${ticketId}/attachments`)
          .set('Origin', origin)
          .field('submissionId', randomUUID())
          .attach('files', png, 'a.png')
      ).status,
    ).toBe(403);
    expect(
      (
        await employee.http
          .post(`/api/tickets/${ticketId}/attachments`)
          .set('Origin', origin)
          .set('X-CSRF-Token', employee.csrf)
          .set('Content-Type', 'multipart/form-data')
          .send('broken')
      ).status,
    ).toBe(400);
    expect(
      (await fileRequest(employee).field('uploadedBy', admin.id).attach('files', png, 'a.png'))
        .status,
    ).toBe(400);
    expect(
      (await fileRequest(employee).attach('files', Buffer.alloc(21000, 65), 'large.txt')).status,
    ).toBe(413);
    expect((await upload(otherAgent)).status).toBe(404);
  });
  it('rejects traversal, markup in text and MIME mismatch, and refuses unsafe storage roots', async () => {
    for (const name of ['../image.png', '..\\image.png', 'C:image.png', 'bad\r\n.png'])
      await expect(validateFile(name, 'image/png', png)).rejects.toThrow();
    await expect(validateFile('a.png', 'text/plain', png)).rejects.toThrow();
    await expect(
      validateFile('a.txt', 'text/plain', Buffer.from('<script>alert(1)</script>')),
    ).rejects.toThrow();
    await expect(validateFile('a.txt', 'text/plain', Buffer.from([0xff, 0xfe]))).rejects.toThrow();
    expect(
      (
        await validateFile(
          'report.txt',
          'text/plain',
          Buffer.from('Printer offline\nError code 42'),
        )
      ).mime,
    ).toBe('text/plain');
    expect(
      (
        await validateFile(
          'report.pdf',
          'application/pdf',
          Buffer.from('%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF'),
        )
      ).mime,
    ).toBe('application/pdf');
    expect(() => localStorage({ UPLOAD_DIR: 'client/public/files' })).toThrow();
    expect(() => localStorage({ UPLOAD_DIR: 'client' })).toThrow();
    expect(() => localStorage({ UPLOAD_DIR: 'server/src' })).toThrow();
    await expect(localStorage({ UPLOAD_DIR: directory }).get('../secret')).rejects.toThrow();
  });
  it('keeps internal notes and their attachments private and enforces message ownership', async () => {
    const r = await fileRequest(agent, '/comments')
      .field('message', 'Internal printer diagnostic notes')
      .field('isInternal', 'true')
      .attach('files', png, 'internal.png');
    expect(r.status).toBe(201);
    const list = await agent.http.get(`/api/tickets/${ticketId}/attachments`);
    const a = list.body.data[0];
    expect(a.commentId).toBe(r.body.data.id);
    expect(a.isInternal).toBe(true);
    expect(
      (await employee.http.get(`/api/tickets/${ticketId}/attachments`)).body.data,
    ).toHaveLength(0);
    expect((await employee.http.get(`/api/attachments/${a.id}/download`)).status).toBe(404);
    expect((await remove(employee, a.id)).status).toBe(404);
    expect((await employee.http.get(`/api/tickets/${ticketId}/comments`)).body.data).toHaveLength(
      0,
    );
    expect((await upload(employee, true)).status).toBe(403);
    expect(
      (
        await fileRequest(agent)
          .field('commentId', r.body.data.id)
          .field('isInternal', 'false')
          .attach('files', png, 'a.png')
      ).status,
    ).toBe(400);
    const publicComment = await comment(employee, 'My printer is still disconnected.');
    expect(
      (
        await fileRequest(agent)
          .field('commentId', publicComment.body.data.id)
          .attach('files', png, 'a.png')
      ).status,
    ).toBe(403);
  });
  it('deletes only for the uploader or admin and handles missing objects safely', async () => {
    const uploaded = await upload(employee),
      id = uploaded.body.data[0].id;
    expect((await remove(agent, id)).status).toBe(403);
    expect((await remove(admin, id)).status).toBe(200);
    expect((await employee.http.get(`/api/attachments/${id}/download`)).status).toBe(404);
    const [deleted] = await fixture.db.select().from(attachments).where(eq(attachments.id, id));
    expect(deleted!.deletedAt).toBeTruthy();
    expect((await readdir(directory)).includes(deleted!.storageKey)).toBe(false);
    const missing = await upload(employee),
      missingId = missing.body.data[0].id;
    const [row] = await fixture.db.select().from(attachments).where(eq(attachments.id, missingId));
    await unlink(join(directory, row!.storageKey));
    expect((await employee.http.get(`/api/attachments/${missingId}/download`)).status).toBe(404);
    expect((await remove(employee, missingId)).status).toBe(200);
  });
  it('deduplicates concurrent uploads and rejects reused tokens with different content', async () => {
    const id = randomUUID();
    const [a, b] = await Promise.all([upload(employee, false, id), upload(employee, false, id)]);
    expect(a.status).toBe(201);
    expect(b.body.data[0].id).toBe(a.body.data[0].id);
    expect(
      await fixture.db.select().from(attachments).where(eq(attachments.ticketId, ticketId)),
    ).toHaveLength(1);
    expect(
      (
        await fileRequest(employee, '/attachments', id).attach(
          'files',
          Buffer.from('different text'),
          'a.txt',
        )
      ).status,
    ).toBe(409);
  });
  it('compensates failed writes and database failures, rolling back the whole message', async () => {
    const objects = new Map<string, Buffer>();
    const storage: PrivateStorage = {
      put: async (key: string, value: Buffer) => {
        objects.set(key, value);
        throw new Error('disk failure');
      },
      get: async () => png,
      remove: async (key: string) => {
        objects.delete(key);
      },
    };
    const service = attachmentService(fixture.db, storage);
    const files = [{ name: 'a.png', mime: 'image/png', contents: png }];
    await expect(
      service.submit(
        employeeActor,
        'comment',
        ticketId,
        { submissionId: randomUUID(), message: 'This message must roll back.' },
        files,
      ),
    ).rejects.toThrow();
    expect(objects.size).toBe(0);
    expect(
      await fixture.db.select().from(comments).where(eq(comments.ticketId, ticketId)),
    ).toHaveLength(0);
    storage.put = async (key, value) => {
      objects.set(key, value);
    };
    await expect(
      service.submit(
        employeeActor,
        'comment',
        ticketId,
        { submissionId: randomUUID(), message: 'Database constraint must roll back.' },
        [{ ...files[0]!, mime: 'application/javascript' }],
      ),
    ).rejects.toThrow();
    expect(objects.size).toBe(0);
    expect(
      await fixture.db.select().from(comments).where(eq(comments.ticketId, ticketId)),
    ).toHaveLength(0);
    await expect(
      service.submit(
        employeeActor,
        'comment',
        ticketId,
        { submissionId: randomUUID(), message: 'Cancelled message.' },
        files,
        () => true,
      ),
    ).rejects.toThrow();
    expect(objects.size).toBe(0);
  });
});

describe('conversations, read tracking and saved replies', () => {
  it('persists public messages, roles and read cursors without counting own or hidden replies', async () => {
    const own = await comment(employee, 'Printer still disconnects.');
    expect(own.status).toBe(201);
    expect((await state(employee)).unreadCount).toBe(0);
    const visible = await comment(agent, 'Please reconnect the printer to Wi-Fi.');
    await comment(agent, 'Private diagnostic information', true);
    expect((await state(employee)).unreadCount).toBe(1);
    expect((await state(admin)).unreadCount).toBe(3);
    const list = await employee.http.get(`/api/tickets?search=Printer&limit=100`);
    expect(list.body.data.items.find((t: { id: string }) => t.id === ticketId).unreadCount).toBe(1);
    const read = await post(employee, `/tickets/${ticketId}/read`, {
      throughPosition: visible.body.data.position,
    });
    expect(read.status).toBe(200);
    expect((await state(employee)).unreadCount).toBe(0);
    await post(employee, `/tickets/${ticketId}/read`, { throughPosition: own.body.data.position });
    expect((await state(employee)).lastPosition).toBe(visible.body.data.position);
    const history = await employee.http.get(`/api/tickets/${ticketId}/comments`);
    expect(history.body.data).toHaveLength(2);
    expect(history.body.data[1].authorRole).toBe('agent');
    expect(history.body.data[1].isUnread).toBe(false);
    expect(
      (await post(employee, `/tickets/${ticketId}/read`, { throughPosition: 999999999 })).status,
    ).toBe(400);
    expect((await otherAgent.http.get(`/api/tickets/${ticketId}/conversation-state`)).status).toBe(
      404,
    );
    expect(
      (await post(otherAgent, `/tickets/${ticketId}/read`, { throughPosition: 0 })).status,
    ).toBe(404);
  });
  it('deduplicates message retries, rejects empty text and employees posting internal notes', async () => {
    const body = { message: 'Please review my screenshot.', submissionId: randomUUID() };
    const a = await post(employee, `/tickets/${ticketId}/comments`, body),
      b = await post(employee, `/tickets/${ticketId}/comments`, body);
    expect(a.status).toBe(201);
    expect(b.body.data.id).toBe(a.body.data.id);
    expect((await comment(employee, '')).status).toBe(400);
    expect((await comment(employee, 'Private note attempt', true)).status).toBe(403);
    expect((await comment(otherAgent, 'Unrelated ticket attempt')).status).toBe(404);
  });
  it('stores and manages shared templates with agent ownership and admin override', async () => {
    const body = {
      title: 'Printer troubleshooting',
      body: 'Please verify that the printer is connected to Wi-Fi.',
    };
    expect((await post(employee, '/response-templates', body)).status).toBe(403);
    expect((await employee.http.get('/api/response-templates')).status).toBe(403);
    const r = await post(agent, '/response-templates', body);
    expect(r.status).toBe(201);
    const id = r.body.data.id;
    const mutate = (c: Client, method: 'patch' | 'delete', data: object) =>
      c.http[method]('/api/response-templates/' + id)
        .set('Origin', origin)
        .set('X-CSRF-Token', c.csrf)
        .send(data);
    expect((await mutate(otherAgent, 'patch', body)).status).toBe(403);
    expect((await mutate(agent, 'patch', { ...body, title: 'Printer connection' })).status).toBe(
      200,
    );
    const list = await otherAgent.http.get('/api/response-templates?search=Printer');
    expect(list.body.data.items[0]).toMatchObject({ id, canManage: false });
    expect((await mutate(admin, 'delete', {})).status).toBe(200);
    expect((await agent.http.get('/api/response-templates?search=Printer')).body.data.total).toBe(
      0,
    );
  });
  it('removes attachment and conversation access after reassignment', async () => {
    const r = await upload(agent, true);
    await comment(agent, 'Internal handoff', true);
    const assigned = await admin.http
      .patch(`/api/tickets/${ticketId}/assign`)
      .set('Origin', origin)
      .set('X-CSRF-Token', admin.csrf)
      .send({
        assignedAgentId: otherAgent.id,
        expectedVersion: 0,
        reason: 'Assign to the replacement specialist.',
      });
    expect(assigned.status).toBe(200);
    expect((await agent.http.get(`/api/attachments/${r.body.data[0].id}/download`)).status).toBe(
      404,
    );
    expect((await agent.http.get(`/api/tickets/${ticketId}/comments`)).status).toBe(404);
    expect(
      (await otherAgent.http.get(`/api/attachments/${r.body.data[0].id}/download`)).status,
    ).toBe(200);
    expect((await otherAgent.http.get(`/api/tickets/${ticketId}/comments`)).body.data).toHaveLength(
      1,
    );
  });
  it('retains attachments, conversations and read state when the application instance restarts', async () => {
    const uploaded = await upload(employee);
    const reply = await comment(agent, 'Persistent printer troubleshooting response.');
    await post(employee, `/tickets/${ticketId}/read`, {
      throughPosition: reply.body.data.position,
    });
    app = createApp(fixture.db, { ...fixture.config, UPLOAD_DIR: directory });
    const fresh = await login(
      'employee@resolvedesk.example',
      fixture.secrets.SEED_EMPLOYEE_PASSWORD,
    );
    expect((await state(fresh)).unreadCount).toBe(0);
    expect((await fresh.http.get(`/api/tickets/${ticketId}/comments`)).body.data[0].message).toBe(
      'Persistent printer troubleshooting response.',
    );
    expect(
      (await fresh.http.get(`/api/attachments/${uploaded.body.data[0].id}/download`)).body,
    ).toEqual(png);
  });
});
