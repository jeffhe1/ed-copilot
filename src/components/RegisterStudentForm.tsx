"use client";

import { useState } from "react";

export function RegisterStudentForm({ defaultClassId }: { defaultClassId?: string }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [classId, setClassId] = useState(defaultClassId ?? "");
  const [status, setStatus] = useState<null | { ok: boolean; msg: string }>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch("/api/students", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          classId: classId.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.ok) {
        throw new Error(data?.error || "Failed to register student");
      }
      setStatus({ ok: true, msg: `Registered: ${data.student.name} (${data.student.email})` });
      setName(""); setEmail("");
    } catch (err: any) {
      setStatus({ ok: false, msg: err.message });
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="w-full max-w-md rounded-2xl border bg-white p-4 shadow flex flex-col gap-3">
      <h2 className="text-lg font-semibold">Register Student</h2>

      <label className="text-sm">
        Name
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Jane Doe"
          required
        />
      </label>

      <label className="text-sm">
        Email
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="jane@example.com"
          type="email"
          required
        />
      </label>

      <label className="text-sm">
        Class ID (optional)
        <input
          className="mt-1 w-full rounded-md border px-3 py-2"
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          placeholder="demo-class"
        />
      </label>

      <button
        type="submit"
        disabled={loading}
        className="mt-2 rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50"
      >
        {loading ? "Registering..." : "Register Student"}
      </button>

      {status && (
        <p className={`text-sm ${status.ok ? "text-green-600" : "text-red-600"}`}>
          {status.msg}
        </p>
      )}
    </form>
  );
}
