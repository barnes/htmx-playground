import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { about } from "./routes/about";
import { home } from "./routes/home";
import {
    github,
    handleGithubCallback,
    handleGitHubLogin,
    lucia,
} from "./lib/auth";
import { generateState, OAuth2RequestError } from "arctic";
import { getCookie, setCookie } from "hono/cookie";
import { client } from "./lib/db";
import { generateIdFromEntropySize } from "lucia";
import { renderHTML } from "./lib/html";
import { output } from "./routes/mustache";

const app = new Hono();
// app.get("/",async  (c) => { 
//   const session = getCookie(c, "auth_session");
//     const args = [
//         {
//             key: "title",
//             value: "Home",
//         },
//         {
//             key: "description",
//             value: "This is the home page",
//         },
//         { key: "session", value: session? "true" : "false" },
//     ]
//     const html = await renderHTML("./src/routes/index.html", args); 
//     console.log(html);
//     if (!session) {
//         return c.html(html);
//         // return c.text("You are not logged in.");
//     } else {
//         return c.html(html);
//         // return c.text("You are logged in.");
//     }
//   });

app.get("/", async (c) => {
  return c.html(output);
});

// GitHub OAuth
app.get("/login/github", async (c) => {
    // await handleGitHubLogin(c);
    const state = generateState();
    const url = await github.createAuthorizationURL(state);
    setCookie(c, "github_oauth_state", state, {
        path: "/",
        secure: false,
        maxAge: 60 * 60,
        sameSite: "lax",
    });
    console.log(url.href);
    return c.redirect(url.href);
});

app.get("/login/github/callback", async (c) => {
    const code = c.req.query("code");
    const state = c.req.query("state");
    const storedState = getCookie(c, "github_oauth_state") ?? null;

    if (!code || !state || !storedState || state !== storedState) {
        return new Response(null, {
            status: 400,
        });
    }

    try {
        const tokens = await github.validateAuthorizationCode(code);
        const githubUserResponse = await fetch("https://api.github.com/user", {
            headers: {
                Authorization: `Bearer ${tokens.accessToken}`,
            },
        });
        const githubUser: GitHubUser = await githubUserResponse.json();

        // Replace this with your own DB client.
        const existingUser = await client.user.findUnique({
            where: {
                github_id: githubUser.id,
            },
        });

        if (existingUser) {
            const session = await lucia.createSession(existingUser.id, {});
            const sessionCookie = lucia.createSessionCookie(session.id);
            setCookie(c, sessionCookie.name, sessionCookie.value, {
                path: ".",
                ...sessionCookie.attributes,
            });
        } else {
            const userId = generateIdFromEntropySize(10); // 16 characters long

            // Replace this with your own DB client.
            await client.user.create({
                data: {
                    id: userId,
                    github_id: githubUser.id,
                    username: githubUser.login,
                },
            });

            const session = await lucia.createSession(userId, {});
            const sessionCookie = lucia.createSessionCookie(session.id);
            setCookie(c, sessionCookie.name, sessionCookie.value, {
                path: ".",
                ...sessionCookie.attributes,
            });
        }
        return c.redirect("/");
    } catch (e) {
        // the specific error message depends on the provider
        if (e instanceof OAuth2RequestError) {
            // invalid code
            return new Response(null, {
                status: 400,
            });
        }
        return new Response(null, {
            status: 500,
        });
    }
});

interface GitHubUser {
    id: number;
    login: string;
}

export default app;
