import { simpleParser } from "mailparser";
import { isAutomated } from "./email-ingestion.service";

async function check(headerLines: string[], from = "alice@example.test"): Promise<boolean> {
  const raw = [`From: ${from}`, "To: kps@example.test", "Subject: test", ...headerLines, "", "corps"].join(
    "\r\n",
  );
  const parsed = await simpleParser(Buffer.from(raw));
  return isAutomated(parsed.headers as Map<string, unknown>, from);
}

describe("isAutomated (filtre d'ingestion email)", () => {
  it("laisse passer un email écrit par une personne", async () => {
    expect(await check([])).toBe(false);
    expect(await check(["Auto-Submitted: no"])).toBe(false);
  });

  it("écarte les réponses automatiques (RFC 3834) et d'absence", async () => {
    expect(await check(["Auto-Submitted: auto-replied"])).toBe(true);
    expect(await check(["Precedence: auto_reply"])).toBe(true);
    expect(await check(["X-Autoreply: yes"])).toBe(true);
  });

  it("écarte les rebonds et rapports de remise", async () => {
    expect(await check([], "mailer-daemon@googlemail.com")).toBe(true);
    expect(await check(["X-Failed-Recipients: x@example.test"])).toBe(true);
    expect(
      await check(['Content-Type: multipart/report; report-type=delivery-status; boundary="b"']),
    ).toBe(true);
  });

  it("écarte les envois de masse", async () => {
    expect(await check(["Precedence: bulk"])).toBe(true);
  });
});
