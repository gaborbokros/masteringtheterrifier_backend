export const collectionName = 'formSubmissions';
export const uniqueNameFields = ['twitch', 'discord', 'inGameName'];

export async function findDuplicateName(collection, field, value, excludeId) {
	const filter = { [field]: value };
	if (excludeId) {
		filter._id = { $ne: excludeId };
	}
	return collection.findOne(filter, {
		projection: { _id: 1 },
		collation: { locale: 'en', strength: 2 },
	});
}