// Shared response handling; callers retain control over their success/error UI.
window.LibraryAPI = {
  async read(response) {
    const failed = !response.ok;
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      if (failed) return {message:'The server could not complete this request. Please try again.'};
      throw new Error('The server sent an unexpected response. Please try again.');
    }
    let body;
    try { body = await response.json(); } catch { throw new Error('The server sent an unreadable response. Please try again.'); }
    if (failed && response.status >= 500) return {message:'The server could not complete this request. Please try again.'};
    return body;
  },
  async staffFetch(url, options = {}) {
    const headers = new Headers(options.headers);
    const token = localStorage.getItem('adminToken') || localStorage.getItem('librarianToken');
    if (token) headers.set('Authorization', 'Bearer ' + token);
    const response = await fetch(url, {...options, headers});
    if (response.status === 401) {
      localStorage.removeItem('adminToken'); localStorage.removeItem('librarianToken');
      location.replace('/?login=1');
    }
    return response;
  }
};
