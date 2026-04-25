"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiError } from "@/services/api/client";
import { authService, usersService } from "@/services/api/services";
import { clearSession, getSession } from "@/services/auth/session";

type ProfileForm = {
  displayName: string;
  country: string;
  age: string;
  preferredLanguages: string;
  preferredTransportation: string;
  selectedTags: string;
};

function csvToList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export default function ProfilePage() {
  const router = useRouter();
  const session = useMemo(() => getSession(), []);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [form, setForm] = useState<ProfileForm>({
    displayName: "",
    country: "",
    age: "",
    preferredLanguages: "",
    preferredTransportation: "",
    selectedTags: "",
  });

  useEffect(() => {
    let cancelled = false;

    async function loadProfile() {
      if (!session?.userId) {
        setLoading(false);
        setErrorMessage("尚未登入，請先登入。");
        return;
      }

      try {
        const profile = await usersService.get(session.userId);
        if (cancelled) {
          return;
        }

        setForm({
          displayName: profile.display_name || "",
          country: profile.country || "",
          age: profile.age ? String(profile.age) : "",
          preferredLanguages: (profile.preferred_languages || []).join(", "),
          preferredTransportation: (profile.preferred_transportation || []).join(", "),
          selectedTags: (profile.selected_tags || []).join(", "),
        });
      } catch (error) {
        if (cancelled) {
          return;
        }
        if (error instanceof ApiError) {
          setErrorMessage(error.message);
        } else {
          setErrorMessage("讀取個人資料失敗，請稍後再試。");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadProfile();

    return () => {
      cancelled = true;
    };
  }, [session?.userId]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!session?.userId) {
      setErrorMessage("尚未登入，請先登入。");
      return;
    }

    setSaving(true);
    setErrorMessage("");
    setSuccessMessage("");

    try {
      await usersService.update(session.userId, {
        display_name: form.displayName.trim(),
        country: form.country.trim(),
        age: form.age.trim() ? Number(form.age.trim()) : 0,
        preferred_languages: csvToList(form.preferredLanguages),
        preferred_transportation: csvToList(form.preferredTransportation),
        selected_tags: csvToList(form.selectedTags),
      });
      setSuccessMessage("已成功更新個人資料。");
    } catch (error) {
      if (error instanceof ApiError) {
        setErrorMessage(error.message);
      } else {
        setErrorMessage("更新失敗，請稍後再試。");
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleLogout() {
    if (session?.accessToken || session?.refreshToken) {
      try {
        await authService.logout(session?.accessToken, session?.refreshToken);
      } catch {
        // Ignore logout API failures and clear local state anyway.
      }
    }
    clearSession();
    router.push("/login");
  }

  return (
    <div className="p-6 md:p-10" style={{ background: "#f5f7fb", minHeight: "100%" }}>
      <div className="max-w-3xl mx-auto bg-white rounded-2xl p-6 md:p-8" style={{ boxShadow: "0px 4px 16px rgba(0,0,0,0.05)" }}>
        <div className="flex items-center justify-between gap-3 mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-800">我的資料</h1>
            <p className="mt-1 text-sm text-gray-500">連接 User Profile Manager 的個人設定</p>
          </div>
          <button
            onClick={handleLogout}
            className="h-10 px-4 rounded-lg text-sm font-medium border"
            style={{ borderColor: "#ddd", color: "#666" }}
          >
            登出
          </button>
        </div>

        {loading ? (
          <p className="text-sm text-gray-500">載入中...</p>
        ) : (
          <form onSubmit={handleSave} className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-gray-600">帳號 Email (user_id)</label>
              <input
                value={session?.userId || ""}
                readOnly
                className="w-full h-11 rounded-lg px-3 bg-gray-100 text-gray-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-gray-600">顯示名稱</label>
              <input
                value={form.displayName}
                onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-600">國家</label>
              <input
                value={form.country}
                onChange={(e) => setForm((prev) => ({ ...prev, country: e.target.value }))}
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            <div>
              <label className="block text-sm mb-1 text-gray-600">年齡</label>
              <input
                value={form.age}
                onChange={(e) => setForm((prev) => ({ ...prev, age: e.target.value }))}
                inputMode="numeric"
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-gray-600">偏好語言（逗號分隔）</label>
              <input
                value={form.preferredLanguages}
                onChange={(e) => setForm((prev) => ({ ...prev, preferredLanguages: e.target.value }))}
                placeholder="zh-TW, en"
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-gray-600">交通偏好（逗號分隔）</label>
              <input
                value={form.preferredTransportation}
                onChange={(e) => setForm((prev) => ({ ...prev, preferredTransportation: e.target.value }))}
                placeholder="捷運, 公車, 步行"
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm mb-1 text-gray-600">旅遊標籤（逗號分隔）</label>
              <input
                value={form.selectedTags}
                onChange={(e) => setForm((prev) => ({ ...prev, selectedTags: e.target.value }))}
                placeholder="美食探索, 文化歷史, 網美打卡"
                className="w-full h-11 rounded-lg px-3 border border-gray-200"
              />
            </div>

            {errorMessage ? <p className="md:col-span-2 text-sm text-red-500">{errorMessage}</p> : null}
            {successMessage ? <p className="md:col-span-2 text-sm text-emerald-600">{successMessage}</p> : null}

            <div className="md:col-span-2 flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="h-11 px-5 rounded-lg text-white font-semibold disabled:opacity-70"
                style={{ background: "#3abdff" }}
              >
                {saving ? "儲存中..." : "儲存設定"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
