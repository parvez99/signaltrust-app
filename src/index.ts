/** Notes 
# entrypoint: routing only
02/13/2026
- Github login was enabled by adding the following blocks
  - Auth block 
  - Core: GitHub OAuth + session cookie
  - Protected /app + /api/me
  - Helper functions

- Profile flow (form + save + completeness + searchable flag)
  - Added profile flow routes
  - Added profile flow page
  - Added computePreview() - That will make the page feel “alive” and prevent the “0%” confusion.
  **/

/***************************************************************
 * 02/16/2026
 SignalTrust AI Trust Engine MVP (Cloudflare Worker + D1)
 Portable design notes:
  - Keep DB schema “Postgres-friendly”: UUID TEXT keys, created_at ISO strings
  - Store normalized profile JSON as TEXT (later JSONB in Postgres)
  - Keep business logic (normalize + signals + scoring) pure functions
  - Keep DB access behind small helper functions (easy to swap to Postgres)
****************************************************************/

import {
  renderTrustHome,
  renderTrustReportPage,
  renderTrustProfilesPage,
  renderTrustProfilePage,
  renderTrustSignalsPage,
  apiTrustIngest,
  apiTrustRun,
  apiTrustReport,
  apiTrustProfiles,
  apiTrustProfile,
  apiTrustDebugProfile
} from "./routes/trust.js";


import { apiDashboard, apiMe } from "./routes/app.js";
import { 
  renderProfilePage,
  apiUpsertProfile,
  apiGetProfile,
  apiToggleSearchable 
} from "./routes/profile.js";
import { 
  renderApp,
  renderLanding,
  renderWaitlistPage,
  renderCandidatePublic,
  renderThanksPage
} from "./routes/pages.js"

import { logout, githubStart, githubCallback } from "./routes/auth_github.js"
import { googleStart, googleCallback } from "./routes/auth_google.js"
import { 
  apiMeIntroRequests,
  apiMeDecideIntroRequest,
  apiRecruiterCandidates,
  renderRecruiterSearch,
  renderRecruiterRequests,
  apiRecruiterCreateIntroRequest,
  apiRecruiterIntroRequestStatus,
  apiRecruiterIntroRequests
} from "./routes/recruiter.js"

import { renderAdminCandidates, renderAdminWaitlist, apiAdminCandidates } from "./routes/admin.js"
import {
  handleWaitlist, handleWaitlistCount
} from "./routes/waitlist.js"


// All the routes under fetch() 
export default {
  //Function to handle the incoming requests; Routing
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // API
    const path = url.pathname.replace(/\/+$/, ""); // remove trailing slash
    
    // ✅ Serve static browser JS directly from /public
    if (url.pathname.startsWith("/client/")) {
      return env.ASSETS.fetch(request);
    }
    
    if (path === "/api/waitlist" && request.method === "POST") {
      return handleWaitlist(request, env);
    }
    // Review candidates in Admin profile.
    if (path === "/api/admin/candidates" && request.method === "GET") {
      return apiAdminCandidates(request, env);
    }
    // Searchable toggle endpoint
    if (path === "/api/me/searchable" && request.method === "POST") {
      return apiToggleSearchable(request, env);
    }
    if (path === "/api/me/dashboard" && request.method === "GET") {
      return apiDashboard(request, env);
    }

    if (path === "/api/waitlist/count" && request.method === "GET") {
      return handleWaitlistCount(env);
    }

    // Pages
    if (path === "/waitlist" && request.method === "GET") {
      return renderWaitlistPage(env);
    }
    if (path === "/admin/waitlist" && request.method === "GET") {
      return renderAdminWaitlist(request, env);
    }

    if (path === "/thanks" && request.method === "GET") {
      return renderThanksPage(request);
    }

    // Auth - This block is for google login
    if (path === "/auth/google/start" && request.method === "GET") {
      return googleStart(request, env);
    }
    if (path === "/auth/google/callback" && request.method === "GET") {
      return googleCallback(request, env);
    }    

    // Auth - This block is for github login
    /******* Start of Auth block *******/
    if (path === "/auth/github/start" && request.method === "GET") {
      return githubStart(request, env);
    }
    if (path === "/auth/github/callback" && request.method === "GET") {
      return githubCallback(request, env);
    }
    if (path === "/auth/logout" && request.method === "POST") {
      return logout(request, env);
    }

    // App + API
    if (path === "/app" && request.method === "GET") {
      return renderApp(request, env);
    }
    if (path === "/api/me" && request.method === "GET") {
      return apiMe(request, env);
    }
    /******* End of Auth block *******/

    /********** Profile flow routes **********/
    if (path === "/app/profile" && request.method === "GET") {
      return renderProfilePage(request, env);
    }
    if (path === "/api/profile" && request.method === "GET") {
      return apiGetProfile(request, env);
    }
    if (path === "/api/profile" && request.method === "POST") {
      return apiUpsertProfile(request, env);
    }
    /********** End of Profile flow routes **********/

    // Admin UI for listing candidates
    if (path === "/admin/candidates" && request.method === "GET") {
      return renderAdminCandidates(request, env);
    }
    
    // List of publicly avail candidate profiles
    if (path.startsWith("/c/") && request.method === "GET") {
      return renderCandidatePublic(request, env);
    }

    //Recruiter API (no PII)
    if (path === "/api/recruiter/candidates" && request.method === "GET") {
      return apiRecruiterCandidates(request, env);
    }
    
    // Recruiter UI page /r/search
    if (path === "/r/search" && request.method === "GET") {
      return renderRecruiterSearch(request, env);
    }
    // Recruiter UI page /r/requests
    if (path === "/r/requests" && request.method === "GET") {
      return renderRecruiterRequests(request, env);
    }
    
    //Candidate APIs: list + decide (approve/reject)
    if (path === "/api/me/intro-requests" && request.method === "GET") {
      return apiMeIntroRequests(request, env);
    }
    if (path === "/api/me/intro-requests/decide" && request.method === "POST") {
      return apiMeDecideIntroRequest(request, env);
    }
    
    // Recruiter API: create intro request
    if (path === "/api/recruiter/intro-request" && request.method === "POST") {
      return apiRecruiterCreateIntroRequest(request, env);
    }
    
    // Recruiter: “My Requests” endpoint (so recruiter can see approved + contact)
    if (path === "/api/recruiter/intro-requests" && request.method === "GET") {
      return apiRecruiterIntroRequests(request, env);
    }

    // Recruiter API: get intro request status for a candidate
    if (path === "/api/recruiter/intro-request/status" && request.method === "GET") {
      return apiRecruiterIntroRequestStatus(request, env);
    }

    if (path === "/trust" && request.method === "GET") return renderTrustHome(request, env);
    if (path === "/trust/report" && request.method === "GET") return renderTrustReportPage(request, env);
    if (path === "/trust/profiles" && request.method === "GET") return renderTrustProfilesPage(request, env);
    if (path === "/trust/profile" && request.method === "GET") return renderTrustProfilePage(request, env);
    if (path === "/trust/signals" && request.method === "GET") return renderTrustSignalsPage(request, env);
    if (path === "/trust/api" && request.method === "GET") return apiTrustProfile(request, env);
    if (path === "/api/trust/ingest" && request.method === "POST") return apiTrustIngest(request, env);
    if (path === "/api/trust/run" && request.method === "POST") return apiTrustRun(request, env);
    if (path === "/api/trust/report" && request.method === "GET") return apiTrustReport(request, env);

    if (path === "/api/trust/debug-profile" && request.method === "GET") return apiTrustDebugProfile(request, env);

    if (path === "/api/trust/profiles" && request.method === "GET") {
      return apiTrustProfiles(request, env);
    }
    if (path === "/api/trust/profile" && request.method === "GET") return apiTrustProfile(request, env);
    if (path === "/api/debug/colo" && request.method === "GET") {
      return Response.json({
        cf: (request as any).cf ?? null,
        // helpful subset:
        colo: (request as any).cf?.colo,
        country: (request as any).cf?.country,
        city: (request as any).cf?.city,
        region: (request as any).cf?.region,
      })
    }
    
    // Default to landing page
    return new Response(await renderLanding(request, env), {
      headers: {
        "content-type": "text/html; charset=UTF-8",
        "cache-control": "no-store",
      },
    });
  },
};