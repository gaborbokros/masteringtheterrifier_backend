import { ObjectId } from 'mongodb';
import { Router } from 'express';
import { requireFormOpen } from './formDeadline.js';
import { collectionName, findDuplicateName, uniqueNameFields } from './formData.js';

const router = Router({ mergeParams: true });

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
	const allowedFields = [...uniqueNameFields, 'perks', 'addons', 'category'];
	if (Object.keys(req.body).some((key) => !allowedFields.includes(key))) {
		return res.status(400).json({ error: 'Nem módosítható mező szerepel a kérésben.' });
	}
	if (Object.keys(req.body).length === 0) {
		return res.status(400).json({ error: 'Legalább egy módosítandó mezőt meg kell adni.' });
	}

	const errors = [];
	if (req.body.perks !== undefined) {
		validateSelectionArray(req.body.perks, 'perks', 4, errors);
	}
	if (req.body.addons !== undefined) {
		validateSelectionArray(req.body.addons, 'addons', 2, errors);
	}
	for (const field of uniqueNameFields) {
		if (req.body[field] !== undefined
			&& (typeof req.body[field] !== 'string' || req.body[field].trim().length === 0)) {
			errors.push(`${field}: nem üres szövegnek kell lennie.`);
		}
	}
	if (req.body.category !== undefined && req.body.category !== null
		&& (typeof req.body.category !== 'string' || req.body.category.trim().length > 100)) {
		errors.push('category: legfeljebb 100 karakteres szöveg lehet.');
	}
	if (errors.length > 0) {
		return res.status(400).json({ error: 'Érvénytelen módosítás.', details: errors });
	}
	if (!req.db) {
		return res.status(503).json({ error: 'Az adatbázis jelenleg nem érhető el.' });
	}

	try {
		const collection = req.db.collection(collectionName);
		for (const field of uniqueNameFields) {
			if (req.body[field] === undefined) continue;
			const value = req.body[field].trim();
			const duplicate = await findDuplicateName(collection, field, value, id);
			if (duplicate) {
				return res.status(409).json({ error: `A megadott ${field} név már szerepel az adatbázisban.` });
			}
		}

		const updates = { updatedAt: new Date() };
		for (const field of ['perks', 'addons', ...uniqueNameFields]) {
			if (req.body[field] !== undefined) {
				updates[field] = Array.isArray(req.body[field])
					? req.body[field]
					: req.body[field].trim();
			}
		}
		const update = { $set: updates };
		if (req.body.category !== undefined) {
			const category = typeof req.body.category === 'string' ? req.body.category.trim() : '';
			if (category) {
				updates.category = category;
			} else {
				update.$unset = { category: '' };
			}
		}

		const result = await collection.updateOne({ _id: id }, update);
		if (result.matchedCount === 0) {
			return res.status(404).json({ error: 'Az űrlap nem található.' });
		}
		return res.json({ message: 'Az űrlap sikeresen módosult.' });
	} catch (error) {
		return next(error);
	}
});

export default router;