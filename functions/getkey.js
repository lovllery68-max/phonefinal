export async function onRequest(context) {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };

  if (context.request.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = "https://torvipwbrcetkptjprjv.supabase.co";
  const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRvcnZpcHdicmNldGtwdGpwcmp2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ4NDg4NzMsImV4cCI6MjA5MDQyNDg3M30.Lr3WcRrY_fKQoEBE2vOys9P6FgSrr1L_qGo49Gkv_0Q";

  // 频率限制：用 KV 或直接用 Supabase 记录 IP
  const ip = context.request.headers.get("CF-Connecting-IP") || "unknown";

  try {
    // 1. 检查频率限制（查 Supabase 里有没有这个 IP 5分钟内的记录）
    const rateRes = await fetch(
      `${SUPABASE_URL}/rest/v1/rate_limit?ip=eq.${encodeURIComponent(ip)}&select=created_at`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        }
      }
    );
    const rateRows = await rateRes.json();
    if (rateRows && rateRows.length > 0) {
      const lastTime = new Date(rateRows[0].created_at).getTime();
      if (Date.now() - lastTime < 5 * 60 * 1000) {
        return new Response(JSON.stringify({ success: false, msg: "请勿频繁领取，5分钟后再试" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. 找一个未使用的卡密
    const findRes = await fetch(
      `${SUPABASE_URL}/rest/v1/keys?used=eq.false&limit=1&select=code`,
      {
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
        }
      }
    );
    const rows = await findRes.json();

    if (!rows || rows.length === 0) {
      return new Response(JSON.stringify({ success: false, msg: "卡密已发完，请联系管理员补充" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const code = rows[0].code;

    // 3. 标记为已使用
    await fetch(
      `${SUPABASE_URL}/rest/v1/keys?code=eq.${code}`,
      {
        method: "PATCH",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({ used: true })
      }
    );

    // 4. 记录/更新 IP 频率
    await fetch(
      `${SUPABASE_URL}/rest/v1/rate_limit`,
      {
        method: "POST",
        headers: {
          "apikey": SUPABASE_KEY,
          "Authorization": `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ ip, created_at: new Date().toISOString() })
      }
    );

    return new Response(JSON.stringify({ success: true, code }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    return new Response(JSON.stringify({ success: false, msg: "服务异常，请稍后重试" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
}
