document.addEventListener('DOMContentLoaded', renderCartPage);

function renderCartPage() {
  const container = document.getElementById('cart-items');
  const checkoutArea = document.getElementById('cart-checkout-area');
  if (!container) return;

  const cart = getCart();

  if (cart.length === 0) {
    container.innerHTML = '<p>Your cart is empty. Browse the library to add books you want to borrow.</p>';
    if (checkoutArea) checkoutArea.innerHTML = '';
    return;
  }

  container.innerHTML = cart.map(item => `
    <div class="cart-item" data-id="${item.book_id}">
      <img src="${item.cover_image || '/images/placeholder-book.svg'}" alt="${item.title}">
      <div class="cart-item-details">
        <h4>${item.title}</h4>
        <p>${item.category_name}</p>
        <p class="availability">${item.available_copies}</p>
      </div>
      <button class="remove-btn" data-id="${item.book_id}">
        <i class="fa-solid fa-trash"></i> Remove
      </button>
    </div>
  `).join('');

  container.querySelectorAll('.remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      removeFromCart(btn.dataset.id);
      renderCartPage();
    });
  });

  if (checkoutArea) {
    checkoutArea.innerHTML = `
      <button id="checkoutBtn" class="btn btn--accent">
        Confirm Borrow Request (${cart.length} ${cart.length === 1 ? 'book' : 'books'})
      </button>
      <p id="checkoutMessage" class="checkout-message"></p>
    `;
    document.getElementById('checkoutBtn').addEventListener('click', handleCheckout);
  }
}

// Tracks whether checkout should auto-retry once login succeeds
let pendingCheckoutAfterLogin = false;

function handleCheckout() {
  const token = localStorage.getItem('token');

  if (!token) {
    pendingCheckoutAfterLogin = true;
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
      loginBtn.click(); // opens the existing login modal from homepage.js
    } else {
      const messageEl = document.getElementById('checkoutMessage');
      if (messageEl) {
        messageEl.textContent = 'Please log in to submit a borrow request.';
        messageEl.className = 'checkout-message checkout-message--error';
      }
    }
    return;
  }

  submitBorrowRequest(token);
}

async function submitBorrowRequest(token) {
  const messageEl = document.getElementById('checkoutMessage');
  const cart = getCart();
  const bookIds = cart.map(item => item.book_id);

  try {
    const res = await fetch('/api/borrow-requests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ book_ids: bookIds }),
    });

    const result = await res.json();

    if (!res.ok) {
      if (messageEl) {
        messageEl.textContent = result.message || 'Something went wrong. Please try again.';
        messageEl.className = 'checkout-message checkout-message--error';
      }
      return;
    }

    localStorage.removeItem(CART_KEY);
    updateCartBadge();
    renderCartPage();

    const newMessageEl = document.getElementById('checkoutMessage');
    if (newMessageEl) {
      newMessageEl.textContent = 'Your borrow request has been submitted! The librarian will confirm availability.';
      newMessageEl.className = 'checkout-message checkout-message--success';
    }
  } catch (err) {
    console.error('Checkout failed:', err);
    if (messageEl) {
      messageEl.textContent = 'Could not submit your request. Please try again.';
      messageEl.className = 'checkout-message checkout-message--error';
    }
  }
}

// homepage.js's renderAuthState() dispatches this event after every login/logout
document.addEventListener('libauthchange', () => {
  const token = localStorage.getItem('token');
  if (token && pendingCheckoutAfterLogin) {
    pendingCheckoutAfterLogin = false;
    submitBorrowRequest(token);
  }
});