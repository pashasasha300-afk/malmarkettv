export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    // Keep Google's exact verification filename without HTML URL normalization.
    if (url.pathname === "/google44b5a36af74bdd0c.html") {
      url.pathname = "/google44b5a36af74bdd0c";
      return env.ASSETS.fetch(new Request(url, request));
    }
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (url.searchParams.has("channel") || url.searchParams.has("code"))
        return Response.redirect(url.origin + "/watch/" + url.search, 302);
      return Response.redirect(url.origin + "/zh/" + url.search, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
