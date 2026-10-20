(function () {
    const preservedSelector = 'a:not([href^="mailto:"]), button, form, input, img, video, audio, iframe, [data-preserve-page-content]';

    function textContent(element) {
        const copy = element.cloneNode(true);
        copy.querySelectorAll(preservedSelector)
            .forEach(preserved => preserved.remove());
        return copy.textContent.replace(/\s+/g, ' ').trim();
    }

    function getSections(documentCopy) {
        const pageTitle = documentCopy.querySelector('h1');
        const introRoot = pageTitle?.closest('.info-hero, .hero-content') || null;
        const sections = [];

        if (introRoot) {
            sections.push(createSection(introRoot, 'intro', 'Page introduction', pageTitle));
        }

        let sectionNumber = 0;
        documentCopy.querySelectorAll('.hero-purpose > div').forEach(sectionRoot => {
            const heading = sectionRoot.querySelector('h2');
            const key = `section-${++sectionNumber}`;
            sections.push(createSection(sectionRoot, key, heading ? textContent(heading) : `Section ${sectionNumber}`, heading));
        });

        documentCopy.querySelectorAll('main').forEach(main => {
            let child = main.firstElementChild;
            while (child) {
                if (child === introRoot || (introRoot && child.contains(introRoot)) || child.closest('[data-preserve-page-content]')) {
                    child = child.nextElementSibling;
                    continue;
                }

                if (child.matches('h2')) {
                    const wrapper = documentCopy.createElement('section');
                    wrapper.dataset.generatedPageContentSection = 'true';
                    main.insertBefore(wrapper, child);
                    const firstHeading = child;
                    child = firstHeading.nextElementSibling;
                    wrapper.append(firstHeading);
                    while (child && !child.matches('h2')) {
                        const next = child.nextElementSibling;
                        wrapper.append(child);
                        child = next;
                    }
                    child = wrapper;
                }

                const root = child;
                const heading = root.querySelector('h2, h3, h1');
                const label = heading ? textContent(heading) : getSectionLabel(root, sectionNumber + 1);
                const key = `section-${++sectionNumber}`;
                sections.push(createSection(root, key, label, heading));
                child = root.nextElementSibling;
            }
        });

        return sections.filter(section => section.body.length > 0 || section.title.length > 0);
    }

    function createSection(root, key, label, heading) {
        const textSelector = 'h2, h3, h4, p, li, blockquote, small, strong, .info-callout, .contact-detail';
        const textElements = [
            ...(root.matches(textSelector) ? [root] : []),
            ...root.querySelectorAll(textSelector)
        ];
        const body = textElements
            .filter(element => element !== heading
                && !element.closest('[data-preserve-page-content]')
                && !element.parentElement.closest(textSelector))
            .map(textContent)
            .filter(Boolean)
            .join('\n\n');

        return {
            root,
            key,
            label,
            title: heading ? textContent(heading) : label,
            body
        };
    }

    function getSectionLabel(root, number) {
        const label = root.id || root.classList[0] || `Section ${number}`;
        return label
            .replace(/([a-z])([A-Z])/g, '$1 $2')
            .replace(/[-_]+/g, ' ')
            .replace(/\b\w/g, character => character.toUpperCase());
    }

    function applySection(root, content) {
        let heading = root.querySelector('h1, h2, h3, h4');
        if (!heading) {
            heading = document.createElement(root.matches('.info-hero, .hero-content') ? 'h1' : 'h2');
        }
        heading.textContent = content.title;

        const preservedContent = Array.from(root.querySelectorAll(preservedSelector))
            .filter(element => !element.parentElement.closest(preservedSelector));
        const paragraphs = content.body.split(/\n\s*\n/).filter(Boolean).map(paragraphText => {
            const paragraph = document.createElement('p');
            paragraphText.split('\n').forEach((line, index) => {
                if (index) paragraph.append(document.createElement('br'));
                appendLinks(paragraph, line);
            });
            return paragraph;
        });
        const titleIsInRoot = root.contains(heading);
        root.replaceChildren(
            ...(titleIsInRoot ? [heading] : []),
            ...paragraphs,
            ...preservedContent
        );
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
            container.append(link, document.createTextNode(trailingPunctuation));
            offset = start + rawValue.length;
        }
        container.append(document.createTextNode(text.slice(offset)));
    }

    window.LegitWaysPageContentSections = { getSections, applySection };
})();
