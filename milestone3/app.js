// Open Library SPA using jQuery AJAX
$(function () {
  var PER_VIEW = 10;                 // books per page view
  var MAX_RESULTS = 50;              // most results we keep
  var COLLECTION_SUBJECT = 'science_fiction';

  var allResults = [];               // up to 50 search results, paginated locally
  var currentPage = 1;
  var currentTerm = '';
  var authorsById = {};              // Work ID -> author names (from search or subject data)
  var detailsCache = {};             // Work ID -> work record already retrieved

  // ---------- Helpers ----------
  function esc(s) { return $('<div>').text(s).html(); }
  function msg(target, text, isError) {
    $(target).html(text ? '<p class="msg' + (isError ? ' error' : '') + '">' + text + '</p>' : '');
  }
  function coverSmall(id, title) {
    return id
      ? '<img src="https://covers.openlibrary.org/b/id/' + id + '-S.jpg" alt="Cover of ' + esc(title) + '">'
      : '<div class="nocover-s">No cover</div>';
  }
  // One item layout shared by the search results and the collection
  function itemHtml(workId, title, coverId) {
    return '<li data-id="' + workId + '">' + coverSmall(coverId, title) +
      '<button type="button" class="book-btn" data-id="' + workId + '">' + esc(title || 'Untitled') + '</button></li>';
  }

  // ---------- Search ----------
  $('#searchForm').on('submit', function (e) {
    e.preventDefault();
    var term = $.trim($('#term').val());
    if (!term) { msg('#searchMsg', 'Please enter a search term.', true); return; }
    runSearch(term);
  });

  function runSearch(term) {
    currentTerm = term;
    $('#searchBtn').prop('disabled', true);          // prevent overlapping submissions
    $('#results').empty();
    $('#pager').prop('hidden', true);
    msg('#searchMsg', 'Loading results...');

    $.ajax({
      url: 'https://openlibrary.org/search.json',
      data: { q: term, limit: MAX_RESULTS, fields: 'key,title,cover_i,author_name' },
      dataType: 'json'
    }).done(function (data) {
      allResults = (data.docs || []).slice(0, MAX_RESULTS);
      if (allResults.length === 0) {
        msg('#searchMsg', 'No books matched "' + esc(term) + '". Try different keywords.');
        return;
      }
      $.each(allResults, function (i, b) {
        authorsById[b.key.replace('/works/', '')] = b.author_name || [];
      });
      msg('#searchMsg', '');
      showPage(1);                                   // new search resets to view 1
    }).fail(function () {
      msg('#searchMsg', 'Sorry, the search failed. Please try again.', true);
    }).always(function () {
      $('#searchBtn').prop('disabled', false);       // restore the button
    });
  }

  // ---------- Pagination (local, no page reload) ----------
  function showPage(page) {
    var totalPages = Math.ceil(allResults.length / PER_VIEW);
    currentPage = Math.min(Math.max(page, 1), totalPages);
    var start = (currentPage - 1) * PER_VIEW;
    var $list = $('#results').empty();
    $.each(allResults.slice(start, start + PER_VIEW), function (i, b) {
      $list.append(itemHtml(b.key.replace('/works/', ''), b.title, b.cover_i));
    });
    $('#pageInfo').text('Page ' + currentPage + ' of ' + totalPages);
    $('#prevBtn').prop('disabled', currentPage === 1);
    $('#nextBtn').prop('disabled', currentPage === totalPages);
    $('#pager').prop('hidden', totalPages < 1);
  }
  $('#prevBtn').on('click', function () { showPage(currentPage - 1); });
  $('#nextBtn').on('click', function () { showPage(currentPage + 1); });

  // ---------- Predefined collection ----------
  function loadCollection() {
    msg('#collectionMsg', 'Loading collection...');
    $.ajax({
      url: 'https://openlibrary.org/subjects/' + COLLECTION_SUBJECT + '.json',
      data: { limit: 10 },
      dataType: 'json'
    }).done(function (data) {
      var works = data.works || [];
      if (works.length === 0) { msg('#collectionMsg', 'This collection is empty or unavailable right now.'); return; }
      msg('#collectionMsg', '');
      $.each(works, function (i, w) {
        var id = w.key.replace('/works/', '');
        authorsById[id] = $.map(w.authors || [], function (a) { return a.name; });
        $('#collection').append(itemHtml(id, w.title, w.cover_id));
      });
    }).fail(function () {
      msg('#collectionMsg', 'Sorry, the collection could not be loaded.', true);
    });
  }

  // ---------- Selected-book details ----------
  // Works for items in both the results list and the collection
  $(document).on('click', '.book-btn', function () {
    var id = $(this).data('id');
    $('.book-list li').removeClass('active');
    $('li[data-id="' + id + '"]').addClass('active');
    showDetails(id);
  });

  function showDetails(id) {
    if (detailsCache[id]) { renderDetails(id, detailsCache[id]); return; }   // reuse cached record
    msg('#detailsMsg', 'Loading details...');
    $('#details').empty();
    $.ajax({ url: 'https://openlibrary.org/works/' + encodeURIComponent(id) + '.json', dataType: 'json' })
      .done(function (w) { detailsCache[id] = w; renderDetails(id, w); })
      .fail(function () { msg('#detailsMsg', 'Sorry, the details for this book could not be loaded.', true); });
  }

  function renderDetails(id, w) {
    msg('#detailsMsg', '');
    var title = w.title || 'Untitled';

    // Work records use a covers array
    var coverId = null;
    $.each(w.covers || [], function (i, c) { if (c > 0) { coverId = c; return false; } });
    var cover = coverId
      ? '<img src="https://covers.openlibrary.org/b/id/' + coverId + '-M.jpg" alt="Cover of ' + esc(title) + '">'
      : '<div class="nocover">No cover available</div>';

    var names = authorsById[id] || [];
    var authors = names.length ? esc(names.join(', ')) : '<span class="na">Author not available</span>';

    // Description can be text or an object with a value property
    var d = w.description;
    var desc = typeof d === 'string' ? d : (d && d.value ? d.value : '');
    var descHtml = desc ? '<p>' + esc(desc) + '</p>' : '<p class="na">No description available.</p>';

    var subjects = '<p class="na">No subjects available.</p>';
    if ($.isArray(w.subjects) && w.subjects.length) {
      subjects = '<ul>';
      $.each(w.subjects.slice(0, 10), function (i, s) { subjects += '<li>' + esc(s) + '</li>'; });
      subjects += '</ul>';
    }

    $('#details').html('<div class="card">' + cover +
      '<h3>' + esc(title) + '</h3>' +
      '<p><strong>Work ID:</strong> ' + esc(id) + '</p>' +
      '<p><strong>Author(s):</strong> ' + authors + '</p>' +
      '<h4>Description</h4>' + descHtml +
      '<h4>Subjects</h4>' + subjects +
      '<p><a href="https://openlibrary.org/works/' + encodeURIComponent(id) + '" target="_blank" rel="noopener">View "' + esc(title) + '" on Open Library</a></p></div>');
  }

  loadCollection();
});
