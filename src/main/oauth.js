const crypto = require("node:crypto");
const http = require("node:http");
const path = require("node:path");
const { shell } = require("electron");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO_URL = "https://openidconnect.googleapis.com/v1/userinfo";

function renderCallbackPage() {
  return `<!doctype html>
<html lang="zh-Hant">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Han Burger Desktop</title>
    <style>
      :root {
        color-scheme: dark;
        --bg: #0e0c0a;
        --panel: rgba(24, 20, 17, 0.96);
        --line: rgba(255, 255, 255, 0.08);
        --text: #f6efe5;
        --muted: #bca998;
        --accent: #e1a84b;
        --accent2: #6f9a52;
      }

      * { box-sizing: border-box; }

      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: "Segoe UI", "Microsoft JhengHei UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(225, 168, 75, 0.08), transparent 24%),
          radial-gradient(circle at 82% 20%, rgba(111, 154, 82, 0.07), transparent 18%),
          linear-gradient(180deg, #090807 0%, #0e0c0a 100%);
      }

      .panel {
        width: min(460px, calc(100vw - 32px));
        padding: 32px 28px;
        border: 1px solid var(--line);
        border-radius: 24px;
        background: var(--panel);
        box-shadow: 0 24px 60px rgba(0, 0, 0, 0.42);
      }

      .badge {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 14px;
        color: var(--accent);
        font-size: 12px;
        font-weight: 700;
        letter-spacing: 0.14em;
        text-transform: uppercase;
      }

      .dot {
        width: 10px;
        height: 10px;
        border-radius: 50%;
        background: linear-gradient(135deg, var(--accent), var(--accent2));
      }

      h1 {
        margin: 0;
        font-size: 28px;
      }

      p {
        margin: 12px 0 0;
        color: var(--muted);
        line-height: 1.7;
      }

      .tip {
        margin-top: 22px;
        padding: 14px 16px;
        border-radius: 16px;
        border: 1px solid var(--line);
        background: rgba(255, 248, 240, 0.045);
      }
    </style>
  </head>
  <body>
    <main class="panel">
      <div class="badge"><span class="dot"></span><span>Han Burger Desktop</span></div>
      <h1>正在完成登入</h1>
      <p>桌面程式正在處理登入結果，請回到桌面程式繼續操作。</p>
      <div class="tip">如果此視窗沒有自動關閉，可以直接將它關閉。</div>
    </main>
    <script>
      window.setTimeout(() => {
        window.close();
      }, 800);
    </script>
  </body>
</html>`;
}

function toBase64Url(input) {
  return input.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function createPkcePair() {
  const verifier = toBase64Url(crypto.randomBytes(32));
  const challenge = toBase64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

function startLoopbackServer() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();

    server.listen(0, "127.0.0.1", () => {
      resolve({
        server,
        redirectUri: `http://127.0.0.1:${server.address().port}`
      });
    });

    server.on("error", reject);
  });
}

async function openGoogleSignIn(config, paths) {
  const clientId = config.googleOAuth?.clientId;
  const clientSecret = config.googleOAuth?.clientSecret;
  const scopes = config.googleOAuth?.scopes?.length ? config.googleOAuth.scopes : ["openid", "email", "profile"];

  if (!clientId || clientId === "REPLACE_WITH_GOOGLE_DESKTOP_CLIENT_ID") {
    throw new Error("Google OAuth clientId is not configured. Update app-data/config/app-config.json first.");
  }

  const { verifier, challenge } = createPkcePair();
  const { server, redirectUri } = await startLoopbackServer();

  const state = crypto.randomUUID();
  const authUrl = new URL(GOOGLE_AUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("scope", scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", challenge);
  authUrl.searchParams.set("code_challenge_method", "S256");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "select_account");

  shell.openExternal(authUrl.toString());

  const authorization = await new Promise((resolve, reject) => {
    server.on("request", (request, response) => {
      const requestUrl = new URL(request.url, "http://127.0.0.1");
      const returnedState = requestUrl.searchParams.get("state");
      const code = requestUrl.searchParams.get("code");
      const error = requestUrl.searchParams.get("error");

      response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      response.end(renderCallbackPage());
      server.close();

      if (error) {
        reject(new Error(`Google sign-in failed: ${error}`));
        return;
      }

      if (returnedState !== state) {
        reject(new Error("Google sign-in state mismatch."));
        return;
      }

      if (!code) {
        reject(new Error("Google sign-in did not return an authorization code."));
        return;
      }

      resolve({ code, redirectUri });
    });

    server.on("error", reject);
  });

  const tokenParams = new URLSearchParams({
    client_id: clientId,
    code: authorization.code,
    code_verifier: verifier,
    grant_type: "authorization_code",
    redirect_uri: authorization.redirectUri
  });

  if (clientSecret) {
    tokenParams.set("client_secret", clientSecret);
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body: tokenParams.toString()
  });

  if (!tokenResponse.ok) {
    const errorBody = await tokenResponse.text();
    throw new Error(`Failed to exchange Google token: ${tokenResponse.status} ${errorBody}`);
  }

  const tokenJson = await tokenResponse.json();
  const userInfoResponse = await fetch(GOOGLE_USERINFO_URL, {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`
    }
  });

  if (!userInfoResponse.ok) {
    throw new Error(`Failed to fetch Google profile: ${userInfoResponse.status}`);
  }

  const profile = await userInfoResponse.json();
  const safeUserFolder = String(profile.email || profile.sub || "user").replace(/[^a-zA-Z0-9._-]/g, "_");

  return {
    authProvider: "google",
    email: profile.email || "",
    name: profile.name || profile.email || "Google User",
    avatarUrl: profile.picture || "",
    profilePath: path.join(paths.usersRoot, safeUserFolder),
    updatedAt: new Date().toISOString()
  };
}

module.exports = {
  openGoogleSignIn
};
