// Open Library SPA: jQuery AJAX for data, Mustache.js for rendering
$(function () {
  var PER_VIEW = 10, MAX_RESULTS = 50, SUBJECT = 'science_fiction';
  var allResults = [], currentPage = 1, selectedId = null;
  var detailsCache = {};          // Work ID -> work record
  var collectionBooks = [];       // kept so the collection can re-render (selection highlight)

  // Templates are read from index.html and parsed once
  var tplBooks = $('#tpl-books').html();
  var tplDetails = $('#tpl-details').html();
  Mustache.parse(tplBooks);
  Mustache.parse(tplDetails);

  // ---------- Helpers ----------
  function esc(s) { return $('<div>').text(s).html(); }
  function msg(target, text, isError) {
    $(target).html(text ? '<p class="msg' + (isError ? ' error' : '') + '">' + text + '</p>' : '');
  }
  // Turn raw API data into the simple object the templates expect
  function makeBook(workId, title, coverId, authorList, year, langList) {
    return {
      workId: workId,
      title: title || 'Untitled',
      coverUrl: coverId ? 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg' : '',
      authors: authorList && authorList.length ? authorList.join(', ') : 'Author not available',
      year: year || '',
      languages: langList && langList.length ? langList.join(', ') : '',
      active: workId === selectedId
    };
  }
  function renderBooks(target, books) {
    $(target).html(Mustache.render(tplBooks, { books: books }));
  }

  // ---------- Tabs and layout switching ----------
  $('.tab').on('click', function () {
    var tab = $(this).data('tab');
    $('.tab').removeClass('active').attr('aria-selected', 'false');
    $(this).addClass('active').attr('aria-selected', 'true');
    $('#resultsSection').prop('hidden', tab !== 'results');   // results stay in memory, nothing is cleared
    $('#collectionSection').prop('hidden', tab !== 'collection');
  });
  $('.layout-btn').on('click', function () {
    var layout = $(this).data('layout');
    $('.layout-btn').removeClass('active').attr('aria-pressed', 'false');
    $(this).addClass('active').attr('aria-pressed', 'true');
    $('#app').removeClass('view-grid view-list').addClass('view-' + layout);
  });

  // ---------- Search ----------
  $('#searchForm').on('submit', function (e) {
    e.preventDefault();
    var term = $.trim($('#term').val());
    if (!term) { msg('#searchMsg', 'Please enter a search term.', true); return; }
    msg('#searchMsg', '');
    runSearch(term);
  });

  function runSearch(term) {
    $('.tab[data-tab="results"]').trigger('click');
    $('#searchBtn').prop('disabled', true);
    $('#results').empty();
    $('#pager').prop('hidden', true);
    msg('#resultsMsg', 'Loading results...');
    $.ajax({
      url: 'https://openlibrary.org/search.json',
      data: { q: term, limit: MAX_RESULTS, fields: 'key,title,cover_i,author_name,first_publish_year,language' },
      dataType: 'json'
    }).done(function (data) {
      var docs = (data.docs || []).slice(0, MAX_RESULTS);
      if (docs.length === 0) {
        allResults = [];
        msg('#resultsMsg', 'No books matched "' + esc(term) + '". Try different keywords.');
        return;
      }
      allResults = $.map(docs, function (d) {
        return makeBook(d.key.replace('/works/', ''), d.title, d.cover_i, d.author_name, d.first_publish_year, d.language);
      });
      msg('#resultsMsg', '');
      showPage(1);                         // new search resets to page 1
    }).fail(function () {
      msg('#resultsMsg', 'Sorry, the search failed. Please try again.', true);
    }).always(function () {
      $('#searchBtn').prop('disabled', false);
    });
  }

  // ---------- Pagination ----------
  function showPage(page) {
    var totalPages = Math.ceil(allResults.length / PER_VIEW);
    currentPage = Math.min(Math.max(page, 1), totalPages);
    var start = (currentPage - 1) * PER_VIEW;
    var pageBooks = $.map(allResults.slice(start, start + PER_VIEW), function (b) {
      b.active = b.workId === selectedId;
      return b;
    });
    renderBooks('#results', pageBooks);
    $('#pageInfo').text('Page ' + currentPage + ' of ' + totalPages);
    $('#prevBtn').prop('disabled', currentPage === 1);
    $('#nextBtn').prop('disabled', currentPage === totalPages);
    $('#pager').prop('hidden', false);
  }
  $('#prevBtn').on('click', function () { showPage(currentPage - 1); });
  $('#nextBtn').on('click', function () { showPage(currentPage + 1); });

  // ---------- Collection ----------
  function loadCollection() {
    msg('#collectionMsg', 'Loading collection...');
    $.ajax({ url: 'https://openlibrary.org/subjects/' + SUBJECT + '.json', data: { limit: 10 }, dataType: 'json' })
      .done(function (data) {
        var works = data.works || [];
        if (works.length === 0) { msg('#collectionMsg', 'This collection is empty or unavailable right now.'); return; }
        collectionBooks = $.map(works, function (w) {
          var names = $.map(w.authors || [], function (a) { return a.name; });
          return makeBook(w.key.replace('/works/', ''), w.title, w.cover_id, names, w.first_publish_year, null);
        });
        msg('#collectionMsg', '');
        renderBooks('#collection', collectionBooks);
      })
      .fail(function () { msg('#collectionMsg', 'Sorry, the collection could not be loaded.', true); });
  }

  // ---------- Details on demand ----------
  $(document).on('click', '.book-btn', function () {
    selectedId = $(this).data('id');
    $('.book').removeClass('active');
    $('.book[data-id="' + selectedId + '"]').addClass('active');
    showDetails(selectedId);
  });

  function findBook(id) {
    var found = null;
    $.each(allResults.concat(collectionBooks), function (i, b) { if (b.workId === id) { found = b; return false; } });
    return found;
  }

  function showDetails(id) {
    if (detailsCache[id]) { renderDetails(id, detailsCache[id]); return; }
    msg('#detailsMsg', 'Loading details...');
    $('#details').empty();
    $.ajax({ url: 'https://openlibrary.org/works/' + encodeURIComponent(id) + '.json', dataType: 'json' })
      .done(function (w) { detailsCache[id] = w; renderDetails(id, w); })
      .fail(function () { msg('#detailsMsg', 'Sorry, the details for this book could not be loaded.', true); });
  }

  function renderDetails(id, w) {
    msg('#detailsMsg', '');
    var base = findBook(id) || {};
    var coverId = null;
    $.each(w.covers || [], function (i, c) { if (c > 0) { coverId = c; return false; } });
    var d = w.description;                                     // text or object with value
    var desc = typeof d === 'string' ? d : (d && d.value ? d.value : '');
    var view = {
      workId: id,
      title: w.title || base.title || 'Untitled',
      coverUrl: coverId ? 'https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg' : (base.coverUrl || ''),
      authors: base.authors || 'Author not available',
      year: base.year || '',
      languages: base.languages || '',
      description: desc,
      subjects: $.isArray(w.subjects) ? w.subjects.slice(0, 10) : [],
      openLibraryUrl: 'https://openlibrary.org/works/' + encodeURIComponent(id)
    };
    $('#details').html(Mustache.render(tplDetails, view));
  }

  loadCollection();
});
