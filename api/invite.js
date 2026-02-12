export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, role, why } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const API_KEY = process.env.BREVO_API_KEY;
  const headers = { 'api-key': API_KEY, 'Content-Type': 'application/json' };

  try {
    // Find or create the "Hocus Pocus" list
    const listsRes = await fetch('https://api.brevo.com/v3/contacts/lists?limit=50', { headers });
    const listsData = await listsRes.json();
    let listId = listsData.lists?.find(l => l.name === 'Hocus Pocus')?.id;

    if (!listId) {
      const createRes = await fetch('https://api.brevo.com/v3/contacts/lists', {
        method: 'POST',
        headers,
        body: JSON.stringify({ name: 'Hocus Pocus', folderId: 1 }),
      });
      const created = await createRes.json();
      listId = created.id;
    }

    // Add contact to Brevo list
    const contactRes = await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        email,
        attributes: { FIRSTNAME: name },
        listIds: [listId],
        updateEnabled: true,
      }),
    });

    if (!contactRes.ok && contactRes.status !== 204) {
      const err = await contactRes.json().catch(() => ({}));
      if (err.code !== 'duplicate_parameter') {
        throw new Error(err.message || 'Failed to add contact');
      }
    }

    // Notify Joanna with the full request details
    const esc = (s) => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

    await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        sender: { name: 'Hocus Pocus', email: 'content@frontira.io' },
        to: [{ email: 'jb@frontira.io', name: 'Joanna' }],
        subject: `HP Invite Request: ${name}`,
        htmlContent: `
          <h2>New Invite Request</h2>
          <table style="border-collapse:collapse;font-family:sans-serif;">
            <tr><td style="padding:8px;color:#888;vertical-align:top;">Name</td><td style="padding:8px;">${esc(name)}</td></tr>
            <tr><td style="padding:8px;color:#888;vertical-align:top;">Email</td><td style="padding:8px;"><a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
            <tr><td style="padding:8px;color:#888;vertical-align:top;">Role</td><td style="padding:8px;">${esc(role) || '-'}</td></tr>
            <tr><td style="padding:8px;color:#888;vertical-align:top;">Question</td><td style="padding:8px;">${esc(why) || '-'}</td></tr>
          </table>
        `,
      }),
    });

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error('Invite error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
}
