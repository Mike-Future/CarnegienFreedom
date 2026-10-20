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
    const sections = new Map(
        window.LegitWaysPageContentSections.getSections(document)
            .map(section => [section.key, section])
    );
    for (const content of pageContent.sections) {
        const section = sections.get(content.sectionKey);
        if (!section) {
            throw new Error(`The section "${content.sectionKey}" no longer exists on "${pageKey}".`);
        }
        window.LegitWaysPageContentSections.applySection(section.root, content);
    }
}
