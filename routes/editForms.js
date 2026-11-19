import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { requireFormOpen } from './formDeadline.js';

const router = Router({ mergeParams: true });
const collectionName = 'formSubmissions';

function isObject(value) {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validateSelectionArray(values, field, expectedLength, errors) {
	if (!Array.isArray(values) || values.length !== expectedLength || !values.every(isObject)) {
		errors.push(`${field}: pontosan ${expectedLength} objektum szükséges.`);
		return;
	}

	const ids = new Set();
	let hasDuplicateId = false;
	values.forEach((value, index) => {
		const id = value.id;
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

function getSubmissionId(req, res) {
	const { submissionId } = req.params;
	if (!/^[\da-f]{24}$/i.test(submissionId)) {
		res.status(400).json({ error: 'Érvénytelen űrlapazonosító.' });
		return null;
	}
	return new ObjectId(submissionId);
}

router.get('/', async (req, res, next) => {
	const id = getSubmissionId(req, res);
	if (!id) return;
	if (!req.db) {
		return res.status(503).json({ error: 'Az adatbázis jelenleg nem érhető el.' });
	}

	try {
		const submission = await req.db.collection(collectionName).findOne(
			{ _id: id },
			{ projection: { _id: 0, perks: 1, addons: 1 } },
		);
		if (!submission) {
			return res.status(404).json({ error: 'Az űrlap nem található.' });
		}
		return res.json({ perks: submission.perks ?? [], addons: submission.addons ?? [] });
	} catch (error) {
		return next(error);
	}
});

router.post('/', requireFormOpen, async (req, res, next) => {
	const id = getSubmissionId(req, res);
	if (!id) return;
	if (!isObject(req.body)) {
		return res.status(400).json({ error: 'Az űrlap törzsének objektumnak kell lennie.' });
	}
	if (Object.keys(req.body).some((key) => !['perks', 'addons'].includes(key))) {
		return res.status(400).json({ error: 'Csak a perks és addons mezők módosíthatók.' });
	}

	const errors = [];
	validateSelectionArray(req.body.perks, 'perks', 4, errors);
	validateSelectionArray(req.body.addons, 'addons', 2, errors);
	if (errors.length > 0) {
		return res.status(400).json({ error: 'Érvénytelen perk vagy addon lista.', details: errors });
	}
	if (!req.db) {
		return res.status(503).json({ error: 'Az adatbázis jelenleg nem érhető el.' });
	}

	try {
		const result = await req.db.collection(collectionName).updateOne(
			{ _id: id },
			{ $set: { perks: req.body.perks, addons: req.body.addons, updatedAt: new Date() } },
		);
		if (result.matchedCount === 0) {
			return res.status(404).json({ error: 'Az űrlap nem található.' });
		}
		return res.json({
			message: 'A perkek és addonok sikeresen módosultak.',
			perks: req.body.perks,
			addons: req.body.addons,
		});
	} catch (error) {
		return next(error);
	}
});

export default router;