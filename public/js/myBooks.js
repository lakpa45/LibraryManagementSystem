document.addEventListener('DOMContentLoaded', () => {
  const {element:el,createCard,createDetails,markBorrowed,safeImage} = window.BookUI;
  const grid=document.getElementById('myBooksGrid'),state=document.getElementById('myBooksState');
  const search=document.getElementById('myBooksSearch'),count=document.getElementById('savedBookCount');
  const filterStatus=document.getElementById('myBooksFilterStatus'),toastBox=document.getElementById('myBooksToast');
  const token=()=>localStorage.getItem('token');
  let books=[],controller,loadVersion=0,toastTimer;
  const removing=new Set();
  const details=createDetails({grid,onWishlist:remove,onBorrow:()=>{render();toast('Book borrowed successfully. View it in My Account.');},onError:text=>toast(text,true),backLabel:'Back to My Books'});
  function toast(text,error=false) {
    clearTimeout(toastTimer);(document.querySelector('dialog[open]')||document.body).append(toastBox);
    toastBox.textContent=text;toastBox.dataset.error=String(error);toastBox.hidden=false;
    toastTimer=setTimeout(()=>{toastBox.hidden=true;},5000);
  }
  function showState(title,text,label,action,icon='\u2661') {
    state.hidden=false;
    const button=typeof action==='string'?el('a','detail-action detail-action--primary',label):el('button','detail-action detail-action--primary',label);
    if(typeof action==='string')button.href=action;else{button.type='button';button.onclick=action;}
    const symbol=el('span','wishlist-state__icon',icon);symbol.setAttribute('aria-hidden','true');
    state.replaceChildren(symbol,el('h2','',title),el('p','',text),button);
  }
  function signedOut() {
    books=[];grid.replaceChildren();grid.setAttribute('aria-busy','false');count.textContent='Your saved books';filterStatus.textContent='';search.disabled=true;
    if(details.isOpen)details.close();
    showState('Your reading list awaits','Sign in to see the books you have saved.','Sign in',()=>document.getElementById('loginBtn')?.click());
  }
  function render() {
    const query=search.value.trim().toLowerCase();
    const filtered=books.filter(b=>[b.title,b.description,b.category_name,b.author,b.isbn].some(v=>String(v||'').toLowerCase().includes(query)));
    count.textContent=`${books.length} saved ${books.length===1?'book':'books'}`;
    filterStatus.textContent=query?`${filtered.length} of ${books.length} saved books match your search`:'';
    grid.replaceChildren();state.hidden=true;
    if(!books.length){showState('A little space for your next favourite','Save books from the catalog and find them here whenever you are ready to read.','Browse Books','/books');return;}
    if(!filtered.length){showState('No matching books','Try another title, author, category or ISBN. Your saved books are still here.','Clear search',()=>{search.value='';render();search.focus();});return;}
    filtered.forEach(book=>{
      const {card,actions}=createCard(book);
      const view=el('button','details-button','View Details');view.type='button';view.dataset.bookId=book.book_id;
      view.onclick=()=>{details.open(book);document.querySelector('.details-actions .detail-action').classList.add('remove-button');};
      const borrow=el('button','detail-action','Borrow Book');borrow.type='button';
      const feedback=el('span');
      window.initialiseBookBorrow(book,borrow,feedback,()=>{markBorrowed(book);render();toast('Book borrowed successfully. View it in My Account.');},text=>toast(text,true));
      if(borrow.disabled&&!book._borrowed)borrow.textContent='Unavailable';
      actions.append(view,borrow);
      if(String(book.book_type).toLowerCase()==='digital'&&safeImage(book.pdf_file)){
        const read=el('a','detail-action','Read PDF');read.href=safeImage(book.pdf_file);read.target='_blank';read.rel='noopener noreferrer';actions.append(read);
      }
      const removeButton=el('button','remove-button','Remove from Wishlist');removeButton.type='button';removeButton.disabled=removing.has(book.book_id);removeButton.onclick=()=>remove(book,removeButton);
      actions.append(removeButton);grid.append(card);
    });
  }
  async function remove(book,button) {
    if(removing.has(book.book_id))return;
    if(!token()){signedOut();return;}
    if(!window.confirm(`Remove "${book.title}" from your wishlist?`))return;
    const session=token();removing.add(book.book_id);button.disabled=true;
    try {
      const response=await fetch(`/api/wishlist/${book.book_id}`,{method:'DELETE',headers:{Authorization:`Bearer ${session}`}});
      const result=await LibraryAPI.read(response);if(session!==token())return;
      if(!response.ok){if(response.status===401||response.status===403){localStorage.removeItem('token');signedOut();}throw Error(result.message||'Unable to remove this book. Please try again.');}
      const position=books.findIndex(b=>b.book_id===book.book_id);
      books=books.filter(b=>b.book_id!==book.book_id);
      if(details.isOpen)details.close();
      render();toast(result.message||'Book removed from your wishlist.');
      const next=grid.querySelectorAll('.details-button')[Math.max(0,position)]||grid.querySelector('.details-button');(next||search).focus({preventScroll:true});
    } catch(error){toast(error.message,true);}
    finally {removing.delete(book.book_id);button.disabled=false;}
  }
  function skeletons() {
    grid.replaceChildren();state.hidden=true;
    for(let i=0;i<8;i++){
      const card=el('article','book-card wishlist-skeleton');card.setAttribute('aria-hidden','true');
      const body=el('div','book-card__body');for(let j=0;j<4;j++)body.append(el('div','wishlist-skeleton__line'));
      card.append(el('div','book-cover-frame'),body);grid.append(card);
    }
    count.textContent='Loading your saved books...';filterStatus.textContent='';
  }
  async function load() {
    controller?.abort();const version=++loadVersion;if(!token())return signedOut();
    const session=token();controller=new AbortController();search.disabled=true;grid.setAttribute('aria-busy','true');skeletons();
    try {
      const response=await fetch('/api/wishlist',{headers:{Authorization:`Bearer ${session}`},signal:controller.signal});
      const result=await LibraryAPI.read(response);if(version!==loadVersion||session!==token())return;
      if(!response.ok){if(response.status===401||response.status===403){localStorage.removeItem('token');return signedOut();}throw Error(result.message||'Please try again in a moment.');}
      if(!Array.isArray(result))throw Error('The library sent an unexpected response. Please try again.');
      books=result.map(book=>({...book,wishlisted:true}));search.disabled=false;render();
    } catch(error){
      if(error.name==='AbortError'||version!==loadVersion)return;
      grid.replaceChildren();count.textContent='Saved books unavailable';showState('We could not load your books',error.message,'Retry',load,'!');
    } finally {if(version===loadVersion)grid.setAttribute('aria-busy','false');}
  }
  search.addEventListener('input',render);document.addEventListener('libauthchange',load);
  window.addEventListener('storage',event=>{if(event.key==='token')load();});load();
});
