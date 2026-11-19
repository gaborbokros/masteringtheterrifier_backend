const FORM_DEADLINE = Date.parse('2026-11-28T23:59:00+01:00');

export function requireFormOpen(_req, res, next) {
	if (Date.now() >= FORM_DEADLINE) {
		return res.status(410).json({ error: 'Az űrlap beküldési és módosítási határideje lejárt.' });
	}
	return next();
}