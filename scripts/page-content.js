const pageKey = document.body.dataset.pageContent || window.location.pathname.split('/').filter(Boolean).pop() || 'home';
applyApprovedPageContent().catch(error => {
    console.error('Approved page content could not be applied:', error);
});

async function applyApprovedPageContent() {
    const response = await fetch(`/api/page-content/${encodeURIComponent(pageKey)}`);
    if (response.status === 404) return;
    if (!response.ok) {
        throw new Error(`Unable to load approved page content (${response.status}).`);
    }

    const pageContent = await response.json();
    const title = document.querySelector('h1');
    const contentTarget = document.querySelector('[data-page-content-target]') || document.querySelector('main');

    if (!title || !contentTarget) {
        throw new Error(`The page content target is missing for "${pageKey}".`);
    }

    title.textContent = pageContent.title;
    const preservedContent = Array.from(contentTarget.querySelectorAll('[data-preserve-page-content]'));
    const titleIsInContentTarget = contentTarget.contains(title);
    const paragraphs = pageContent.body.split(/\n\s*\n/).map(paragraphText => {
        const paragraph = document.createElement('p');
        paragraphText.split('\n').forEach((line, index) => {
            if (index) paragraph.append(document.createElement('br'));
            appendLinks(paragraph, line);
        });
        return paragraph;
    });
    contentTarget.replaceChildren(
        ...(titleIsInContentTarget ? [title] : []),
        ...paragraphs,
        ...preservedContent.filter(element => element !== title)
    );
    if (pageKey === 'privacy-policy') {
        document.querySelector('.privacy-sidebar')?.setAttribute('hidden', '');
    }
}

function appendLinks(container, text) {
    const pattern = /https?:\/\/[^\s]+|[^\s@]+@[^\s@]+\.[^\s@]+/gi;
    let offset = 0;
    for (const match of text.matchAll(pattern)) {
        const rawValue = match[0];
        const trailingPunctuation = rawValue.match(/[.,!?;:)\]]+$/)?.[0] || '';
        const value = trailingPunctuation
            ? rawValue.slice(0, -trailingPunctuation.length)
            : rawValue;
        const start = match.index;
        container.append(document.createTextNode(text.slice(offset, start)));
        const isEmail = !/^https?:\/\//i.test(value);
        const link = document.createElement('a');
        link.href = isEmail ? `mailto:${value}` : value;
        link.textContent = value;
        if (!isEmail) {
            try {
                if (!['http:', 'https:'].includes(new URL(value).protocol)) {
                    container.append(document.createTextNode(rawValue));
                    offset = start + rawValue.length;
                    continue;
                }
            } catch (error) {
                container.append(document.createTextNode(rawValue));
                offset = start + rawValue.length;
                continue;
            }
        }
        container.append(link, document.createTextNode(trailingPunctuation));
        offset = start + rawValue.length;
    }
    container.append(document.createTextNode(text.slice(offset)));
}
