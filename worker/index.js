export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/" || url.pathname === "/index.html") {
      if (url.searchParams.has("channel") || url.searchParams.has("code"))
        return Response.redirect(url.origin + "/watch/" + url.search, 302);
      return Response.redirect(url.origin + "/zh/" + url.search, 301);
    }
    return env.ASSETS.fetch(request);
  },
};
