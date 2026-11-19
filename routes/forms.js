import { Router } from 'express';
import { requireFormOpen } from './formDeadline.js';

const router = Router();

function parseArray(value) {
	if (typeof value === 'string') {
		try {
			return JSON.parse(value);
		} catch {
			return null;
		}
	}
	return value;
}

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function accepted(value) {
	return value === true || value === 'true' || value === 'on' || value === '1';
}

function validateUniqueIds(values, field, errors) {
	if (!Array.isArray(values)) {
		return;
	}

	const ids = new Set();
	let hasDuplicateId = false;
	values.forEach((value, index) => {
		const id = value?.id;
		if ((typeof id !== 'string' && typeof id !== 'number')
			|| (typeof id === 'string' && id.trim().length === 0)
			|| (typeof id === 'number' && !Number.isFinite(id))) {
			errors.push(`${field}[${index}].id: kötelező, nem üres szöveg vagy véges szám.`);
			return;
		}

		const normalizedId = String(id).trim();
		if (ids.has(normalizedId)) {
			hasDuplicateId = true;
		}
		ids.add(normalizedId);
	});

	if (hasDuplicateId) {
		errors.push(field === 'perks'
			? 'minden perknek egyedinek kell lennie'
			: 'nem használhatod ugyanazokat az addonokat');
	}
}

router.post('/', requireFormOpen, async (req, res, next) => {
	const body = req.body;
	if (!isObject(body)) {
		return res.status(400).json({ error: 'Az űrlap törzsének objektumnak kell lennie.' });
	}

	const errors = [];
	for (const field of ['twitch', 'discord', 'inGameName']) {
		if (typeof body[field] !== 'string' || body[field].trim().length === 0) {
			errors.push(`${field}: kötelező, nem üres szöveg.`);
		}
	}

	const perks = parseArray(body.perks);
	if (!Array.isArray(perks) || perks.length !== 4 || !perks.every(isObject)) {
		errors.push('perks: pontosan 4 objektumot tartalmazó tömb szükséges.');
	} else {
		validateUniqueIds(perks, 'perks', errors);
	}

	const addons = parseArray(body.addons);
	if (!Array.isArray(addons) || addons.length !== 2 || !addons.every(isObject)) {
		errors.push('addons: pontosan 2 objektumot tartalmazó tömb szükséges.');
	} else {
		validateUniqueIds(addons, 'addons', errors);
	}

	if (!accepted(body.privacyAccepted)) {
		errors.push('privacyAccepted: az adatkezelési tájékoztató elfogadása kötelező.');
	}
	if (!accepted(body.rulesAccepted)) {
		errors.push('rulesAccepted: a versenyszabályzat elfogadása kötelező.');
	}

	if (errors.length > 0) {
		return res.status(400).json({ error: 'Érvénytelen vagy hiányos űrlap.', details: errors });
	}
	if (!req.db) {
		return res.status(503).json({ error: 'Az adatbázis jelenleg nem érhető el.' });
	}

	const submission = {
		twitch: body.twitch.trim(),
		discord: body.discord.trim(),
		inGameName: body.inGameName.trim(),
		perks,
		addons,
		privacyAccepted: true,
		rulesAccepted: true,
		createdAt: new Date(),
	};

	try {
		const result = await req.db.collection('formSubmissions').insertOne(submission);
		return res.status(201).json({ id: result.insertedId.toString(), message: 'Űrlap sikeresen beküldve.' });
	} catch (error) {
		return next(error);
	}
});

export default router;