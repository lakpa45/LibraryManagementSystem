// Reuse the existing member-only borrowing endpoint; authorization stays server-side.
window.initialiseBookBorrow = function (book, button, message, onSuccess, onError) {
  const physical = String(book.book_type).toLowerCase() === 'physical';
  button.hidden = !physical;
  button.disabled = Boolean(book._borrowed) || Number(book.available_copies) < 1;
  button.textContent = book._borrowed ? 'Borrowed' : button.disabled ? 'Currently unavailable' : 'Borrow Book';
  button.addEventListener('click', async () => {
    const token = localStorage.getItem('token');
    if (!token) { message.textContent = 'Please sign in to borrow this book.'; onError?.(message.textContent); return; }
    button.disabled = true;
    message.textContent = 'Borrowing book…';
    try {
      const response = await fetch('/api/loans/borrow', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ book_id: book.book_id })
      });
      const result = await LibraryAPI.read(response);
      if (!response.ok) throw new Error(result.message || 'Unable to borrow this book.');
      button.textContent = 'Borrowed';
      message.textContent = 'Book borrowed successfully. View it in My Account.';
      onSuccess?.();
    } catch (error) {
      message.textContent = error.message;
      onError?.(error.message);
      button.disabled = false;
    }
  });
};
