// Adapted from https://github.com/sean-public/RecipeFilter
// Modified to work on mobile Safari and remove Chrome-specific functionality
// License: https://github.com/sean-public/RecipeFilter/blob/master/LICENSE

recipeSelectors = [
    '.recipe-callout',
    '.tasty-recipes',
    '.easyrecipe',
    '.innerrecipe',
    '.recipe-summary.wide',
    '.wprm-recipe-container',
    '.recipe-content',
    '.simple-recipe-pro',
    '.mv-recipe-card',
    '.recipe-detail-card',
    '.recipe--detail',
    '.recipe-body',
    'div[itemtype="http://schema.org/Recipe"]',
    'div[itemtype="https://schema.org/Recipe"]',
]
recipeElements = []
oldParentNodeKey = "recipeNabberOldParentNode"

// Returns a NodeList representing a list of the elements's elements that match
// the specified group of selectors, then observes their mutations in order to
// effectively return a live NodeList.
function querySelectorAllLive(element, selector) {
    var result = Array.prototype.slice.call(element.querySelectorAll(selector));
    
    var observer = new MutationObserver(function(mutations) {
        mutations.forEach(function(mutation) {
            [].forEach.call(mutation.addedNodes, function(node) {
                if (node.nodeType === Node.ELEMENT_NODE && node.matches(selector)) {
                    result.push(node);
                }
            });
        });
    });
    
    observer.observe(element, { childList: true, subtree: true });
    
    return result;
}

async function showActualRecipeContent() {
    recipeElements = querySelectorAllLive(document, recipeSelectors)
    
    if (recipeElements.length == 0) {
        return
    }
    
    let recipeCardWrapper = await fetchRecipeCardWrapper()
    await constructRecipeCard(recipeCardWrapper, recipeElements)

    // Fix iOS 15 address bar hiding when scrolling
    // https://stackoverflow.com/questions/69589924/ios-15-minimized-address-bar-issue-with-fixed-position-full-screen-content
    document.documentElement.style.height = "100vh";
}

async function constructRecipeCard(recipeCardWrapper, recipeElements) {
    let documentScrollTop = window.pageYOffset || document.documentElement.scrollTop;
    let firstRecipeElementTop = recipeElements[0].getBoundingClientRect().top
    let firstRecipeElementYPosition = firstRecipeElementTop + documentScrollTop
    
    var recipeCard = recipeCardWrapper.getElementById('recipeNabberModal');
    var recipeCardBody = recipeCardWrapper.getElementById('recipeNabberModalContent');
    
    recipeElements.forEach(function(element) {
        element[oldParentNodeKey] = element.parentNode;
        element.display = 'block';
        
        applyToAllDescendants(element, function(child) {
            if (child.style == null) {
                return;
            }
            child.style.position = 'relative';
        })
        
        recipeCardBody.appendChild(element);
    });
    
    document.body.insertBefore(recipeCard, document.body.firstChild);
    document.getElementById('recipeNabberCloseButton').addEventListener("click", closeRecipeCard);
    await injectRecipeCardCSS()
    collectSavedWordCountAndScrollDistance(recipeCard, firstRecipeElementYPosition)
}

function applyToAllDescendants(node, operation) {
    node.childNodes.forEach(child => {
        if (child == null) { return; }
        applyToAllDescendants(child, operation);
        operation(child);
    });
}

function collectSavedWordCountAndScrollDistance(recipeCard, firstRecipeElementScrollTop) {
    function wordsInElement(element) {
        return element.innerText.split(" ").length
    }
    
    // Collect approximate number of words in the entire document after one
    // second. This is very imprecise since these types of sites load
    // a ton of junk asyncronously and tend to be very slow.
    setTimeout(function() {
        let totalWordCount = wordsInElement(document.body)
        let recipeCardWordCount = wordsInElement(recipeCard)
        let wordsSaved = totalWordCount - recipeCardWordCount
        
        browser.runtime.sendMessage({
            type: "wordsSaved",
            domain: document.domain,
            wordsSaved: wordsSaved,
            firstRecipeElementScrollTop: firstRecipeElementScrollTop
        });
    }, 1000)
}

async function fetchRecipeCardWrapper() {
    let url = browser.runtime.getURL('RecipeCard.html');
    let response = await fetch(url);
    let text = await response.text();
    return new DOMParser().parseFromString(text, "text/html")
}

async function injectRecipeCardCSS() {
    let link = document.createElement('link');
    link.href = browser.runtime.getURL('RecipeCard.css');
    link.rel = 'stylesheet';
    document.head.append(link);
    
    document.body.classList.add('recipeNabberModalOpen');
    
    // Match close button color to title
    let title = document.getElementById('recipeNabberTitle');
    var closeButton = document.getElementById('recipeNabberCloseButton');
    closeButton.style.color = title.style.color;
}

function closeRecipeCard() {
    document.getElementById('recipeNabberModal').style.display = 'none';
    document.body.classList.remove('recipeNabberModalOpen');

    recipeElements.forEach(function(node) {
        // Replace the node we moved
        node[oldParentNodeKey].insertBefore(node, node[oldParentNodeKey].firstChild);
    });
}

function reloadRecipeCard() {
    setTimeout(function() {
        if (document.getElementsByClassName('recipeNabberModalOpen').length > 0) {
            return 
        }

        showActualRecipeContent();
    }, 100);
}

showActualRecipeContent()

// Content-to-popup message passing
browser.runtime.onMessage.addListener(
  function(request, sender, sendResponse) {
      if (request.message === "didSelectReloadCell") {
          reloadRecipeCard();
      }
  }
);
