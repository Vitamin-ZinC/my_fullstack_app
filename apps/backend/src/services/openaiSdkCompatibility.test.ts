import assert from "node:assert/strict";
import test from "node:test";
import OpenAI, { toFile } from "openai";

test("updated SDK preserves compatible chat/vision JSON requests without using Responses", async () => {
  const client = new OpenAI({
    apiKey: "synthetic-sdk-test-key", baseURL: "https://gateway.example.invalid/v1", maxRetries: 0,
    fetch: async (url, init) => {
      const request = new Request(url, init);
      assert.equal(request.url, "https://gateway.example.invalid/v1/chat/completions");
      assert.equal(request.method, "POST");
      assert.equal(request.headers.get("authorization"), "Bearer synthetic-sdk-test-key");
      const body = await request.json();
      assert.equal(body.model, "provider/test-model");
      assert.equal(body.max_tokens, 12000);
      assert.equal(body.response_format.type, "json_object");
      assert.equal(body.messages[0].content[0].type, "text");
      assert.equal(body.messages[0].content[1].type, "image_url");
      return new Response(JSON.stringify({ id: "synthetic", object: "chat.completion", created: 1,
        model: body.model, choices: [{ index: 0, message: { role: "assistant", content: '{"ok":true}' }, finish_reason: "stop" }] }),
      { headers: { "Content-Type": "application/json" } });
    }
  });
  const result = await client.chat.completions.create({
    model: "provider/test-model", max_tokens: 12000, response_format: { type: "json_object" },
    messages: [{ role: "user", content: [{ type: "text", text: "Synthetic compatibility check" }, { type: "image_url", image_url: { url: "https://media.example.invalid/photo.jpg" } }] }]
  });
  assert.equal(result.choices[0].message.content, '{"ok":true}');
});

test("updated SDK preserves multipart audio transcription and gateway provider headers", async () => {
  const client = new OpenAI({
    apiKey: "synthetic-sdk-test-key", baseURL: "https://gateway.example.invalid/v1", maxRetries: 0,
    defaultHeaders: { "X-Keyguard-Provider": "openai" },
    fetch: async (url, init) => {
      const request = new Request(url, init);
      assert.equal(request.url, "https://gateway.example.invalid/v1/audio/transcriptions");
      assert.equal(request.headers.get("x-keyguard-provider"), "openai");
      assert.match(request.headers.get("content-type") ?? "", /^multipart\/form-data; boundary=/);
      const form = await request.formData();
      assert.equal(form.get("model"), "whisper-1");
      const file = form.get("file") as File;
      assert.equal(file.name, "synthetic.wav");
      assert.equal(file.size, 12);
      return new Response(JSON.stringify({ text: "Synthetic transcript" }), { headers: { "Content-Type": "application/json" } });
    }
  });
  const result = await client.audio.transcriptions.create({ model: "whisper-1", file: await toFile(Buffer.from("RIFFtestWAVE"), "synthetic.wav", { type: "audio/wav" }) });
  assert.equal(result.text, "Synthetic transcript");
});
