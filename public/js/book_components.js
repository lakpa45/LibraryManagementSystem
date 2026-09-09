// Shared card content and native details dialog for public book collections.
window.BookUI = (() => {
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const safeImage = value => {
    if (!value) return null;
    try {
      const url = new URL(value, window.location.origin);
      return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
    } catch { return null; }
  };
  function makeCover(book) {
    const frame = element('div', 'book-cover-frame');
    const source = safeImage(book.cover_image);
    if (!source) { frame.append(placeholder(book.title)); return frame; }
    const image = element('img', 'book-cover');
    image.src = source;
    image.alt = `Cover of ${book.title}`;
    image.loading = 'lazy';
    image.addEventListener('error', () => image.replaceWith(placeholder(book.title)), { once: true });
    frame.append(image);
    return frame;
  }

  function placeholder(title) {
    const box = element('div', 'book-placeholder');
    const icon = element('i', 'fa-solid fa-book-open');
    const label = element('span', '', title || 'APNA Library');
    box.append(icon, label);
    return box;
  }

  function availabilityText(book) {
    return Number(book.available_copies) > 0
      ? `Available — ${book.available_copies} ${Number(book.available_copies) === 1 ? 'copy' : 'copies'}`
      : 'Currently unavailable';
  }


  function markBorrowed(book) {
    book.available_copies = Math.max(0, Number(book.available_copies) - 1);
    book._borrowed = true;
  }
  function createCard(book) {
    const card = element('article', 'book-card');
    card.append(makeCover(book));
    const body = element('div', 'book-card__body');
    body.append(element('span', 'book-category', book.category_name || 'Uncategorized'), element('h2', '', book.title), element('p', 'book-description', book.description || 'No description is available.'));
    const stock = element('p', Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no', availabilityText(book));
    const actions = element('div', 'book-actions');
    body.append(stock, actions);card.append(body);
    return {card, body, stock, actions};
  }
  function createDetails({grid, onWishlist, onBorrow, onError, backLabel = 'Back to Books'}) {
    let dialog = document.getElementById('detailsDialog');
    if (!dialog) {
      dialog = element('dialog','details-dialog');dialog.id='detailsDialog';dialog.setAttribute('aria-labelledby','detailsTitle');
      const close=element('button','details-close','\u00d7');close.id='detailsClose';close.type='button';close.setAttribute('aria-label','Close details');
      const content=element('div','details-content');content.id='detailsContent';dialog.append(close,content);document.body.append(dialog);
    }
    const detailsContent = document.getElementById('detailsContent');
  let previousOverflow = '';
  let previousRootOverflow = '';
  let detailMessage;
  let detailsBookId;
  function openDetails(book) {
    detailsBookId = book.book_id;
    detailsContent.replaceChildren();
    const info = element('div', 'details-info');
    info.append(element('span', 'book-category', book.category_name || 'Uncategorized'));
    const title = element('h2', '', book.title);
    title.id = 'detailsTitle';
    info.append(title);
    const meta = element('dl', 'details-meta');
    const fields = [['Category', book.category_name || 'Uncategorized'], ['ISBN', book.isbn || 'Not recorded'], ['Book type', book.book_type || 'Not recorded']];
    if (book.author) fields.unshift(['Author', book.author]);
    fields.forEach(([label, value]) => {
      const row = element('div'); row.append(element('dt', '', label), element('dd', '', value)); meta.append(row);
    });
    info.append(meta);
    const stock = element('p', Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no', availabilityText(book));
    info.append(stock, element('p', 'details-description', book.description || 'No description is available.'));
    const actions = element('div', 'details-actions');
    const wishlist = element('button', 'detail-action', book.wishlisted ? 'Remove from Wishlist' : 'Add to Wishlist');
    wishlist.type = 'button';
    wishlist.setAttribute('aria-pressed', String(Boolean(book.wishlisted)));
    wishlist.addEventListener('click', () => onWishlist(book, wishlist));
    const borrow = element('button', 'detail-action detail-action--primary', 'Borrow Book');
    borrow.type = 'button';
    const close = element('button', 'detail-action', backLabel);
    close.type = 'button'; close.addEventListener('click', () => dialog.close());
    detailMessage = element('p', 'details-message'); detailMessage.setAttribute('aria-live', 'polite');
    window.initialiseBookBorrow(book, borrow, detailMessage, () => {
      markBorrowed(book);
      stock.textContent = availabilityText(book);
      stock.className = Number(book.available_copies) > 0 ? 'availability availability--yes' : 'availability availability--no';
      onBorrow?.(book);
    }, onError);
    actions.append(wishlist, borrow);
    if (String(book.book_type).toLowerCase() === 'digital' && safeImage(book.pdf_file)) {
      const read = element('a', 'detail-action detail-action--primary', 'Read PDF');
      read.href = safeImage(book.pdf_file); read.target = '_blank'; read.rel = 'noopener noreferrer'; actions.append(read);
    }
    actions.append(close); info.append(actions, detailMessage);
    detailsContent.append(makeCover(book), info);
    previousOverflow = document.body.style.overflow;
    previousRootOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    dialog.showModal();
  }
  document.getElementById('detailsClose').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', event => {
    const rect = dialog.getBoundingClientRect();
    if (event.target === dialog && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) dialog.close();
  });
  dialog.addEventListener('close', () => {
    document.documentElement.style.overflow = previousRootOverflow;
    if (document.getElementById('authOverlay')?.classList.contains('is-open')) return;
    document.body.style.overflow = previousOverflow;
    grid.querySelector(`[data-book-id="${detailsBookId}"]`)?.focus({ preventScroll: true });
    if (!grid.querySelector(`[data-book-id="${detailsBookId}"]`)) document.querySelector('#myBooksSearch')?.focus({preventScroll:true});
  });

    return {open:openDetails, close:()=>dialog.close(), get isOpen(){return dialog.open;}, setMessage(text){if(detailMessage)detailMessage.textContent=text;}};
  }
  return {element, safeImage, makeCover, availabilityText, createCard, createDetails, markBorrowed};
})();
