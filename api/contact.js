module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Methode non autorisee' });
  }

  try {
    const { prenom, nom, zone, ville, email, message, turnstileToken } = req.body;

    if (!prenom || !nom || !email || !zone) {
      return res.status(400).json({ error: 'Champs obligatoires manquants' });
    }

    // 1. Verifier Cloudflare Turnstile
    if (!turnstileToken) {
      return res.status(400).json({ error: 'Veuillez completer la verification anti-spam' });
    }

    const captchaResponse = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'secret=' + encodeURIComponent(process.env.TURNSTILE_SECRET_KEY) + '&response=' + encodeURIComponent(turnstileToken)
    });

    const captchaData = await captchaResponse.json();

    if (!captchaData.success) {
      console.error('Echec Turnstile:', captchaData);
      return res.status(400).json({ error: 'Verification anti-spam echouee' });
    }

    // 2. Envoyer email de notification
    const emailResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        sender: { name: 'FAQ SOLARGEO', email: 'chibade@solargeo.fr' },
        to: [
          { email: 'chibade@solargeo.fr', name: 'SOLARGEO' },
          { email: 'mrutil@solargeo.fr', name: 'SOLARGEO' }
        ],
        replyTo: { email: email, name: prenom + ' ' + nom },
        subject: 'Nouveau contact FAQ - ' + prenom + ' ' + nom,
        htmlContent: '<h2 style="color:#2b230f;font-family:Arial,sans-serif;">Nouveau message depuis la FAQ SOLARGEO</h2><table style="border-collapse:collapse;width:100%;max-width:600px;font-family:Arial,sans-serif;"><tr style="background:#fff9e6;"><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;width:180px;">Prenom</td><td style="padding:12px 16px;border:1px solid #eee;">' + prenom + '</td></tr><tr><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;">Nom</td><td style="padding:12px 16px;border:1px solid #eee;">' + nom + '</td></tr><tr style="background:#fff9e6;"><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;">Zone</td><td style="padding:12px 16px;border:1px solid #eee;">' + zone + '</td></tr><tr><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;">Ville</td><td style="padding:12px 16px;border:1px solid #eee;">' + (ville || 'Non renseignee') + '</td></tr><tr style="background:#fff9e6;"><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;">Email</td><td style="padding:12px 16px;border:1px solid #eee;"><a href="mailto:' + email + '">' + email + '</a></td></tr><tr><td style="padding:12px 16px;border:1px solid #eee;font-weight:bold;">Message</td><td style="padding:12px 16px;border:1px solid #eee;">' + (message || 'Aucun message') + '</td></tr></table>'
      })
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error('Erreur Brevo email:', emailResponse.status, emailData);
      return res.status(500).json({ error: 'Erreur envoi email', details: emailData });
    }

    // 3. Ajouter le contact dans le CRM Brevo
    await fetch('https://api.brevo.com/v3/contacts', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': process.env.BREVO_API_KEY,
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        email: email,
        attributes: { PRENOM: prenom, NOM: nom },
        updateEnabled: true
      })
    });

    return res.status(200).json({ success: true });

  } catch (error) {
    console.error('Erreur serveur:', error);
    return res.status(500).json({ error: 'Erreur serveur' });
  }
};
