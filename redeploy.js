import { Octokit } from "@octokit/rest";
import { checkEnvVars } from "./utils.js";
import { getAuthedPb } from "./pocketbase.js";

const folderLocation = "/src/lib/data";
const pokemonFileName = "/pokemonNames.json";
const moveFileName = "/moves.json";

const octokit = new Octokit({ auth: process.env.GITHUB_PAT });

export async function handler(event, context) {
	try {
		await main();
	} catch (err) {
		console.log(err);
	}
	return;
}

const main = async () => {
	if (
		!checkEnvVars([
			"POCKETBASE_URL",
			"ADMIN_EMAIL",
			"ADMIN_PASSWORD",
			"GITHUB_PAT",
		])
	) {
		console.error("Missing env variable");
		return;
	}

	const pb = await getAuthedPb();
	if (!pb) {
		return;
	}

	try {
		const result = await updatePokemonGithub(pb);

		if (result) {
			console.log(`Pokemon Updated: ${JSON.stringify(result)}`);
		} else {
			console.log("No Pokemon changes");
		}
	} catch (err) {
		console.error("Pokemon - Error", err);
	}

	try {
		const result = await updateMoveGithub(pb);

		if (result) {
			console.log(`Updated: ${JSON.stringify(result)}`);
		} else {
			console.log("No move changes");
		}
	} catch (err) {
		console.error(`Moves - Error ${err}`);
	}
};

const getExistingFile = async (filename) => {
	const gitPokemonRequest = await fetch(
		`https://raw.githubusercontent.com/helblingjoel/pokecompanion/main${folderLocation}${filename}`
	);
	return await gitPokemonRequest.json();
};

const pokemonDbToJson = async (pb) => {
	const pokemon = await pb.collection("pokemon_names").getFullList({
		sort: "national_dex",
	});
	const normalisedDb = pokemon.map((entry) => {
		return {
			id: entry.national_dex,
			generation: entry.generation,
			redirect: entry.redirect,
			names: [
				{
					en: entry.en,
				},
				{
					de: entry.de,
				},
				{
					es: entry.es,
				},
				{
					fr: entry.fr,
				},
				{
					it: entry.it,
				},
				{
					"ja-hrkt": entry.ja_hrkt,
				},
				{
					"zh-hans": entry.zh_hans,
				},
			],
		};
	});

	return normalisedDb;
};

function findDifferences(sortedDb, sortedGit) {
	const differences = [];

	const moreEntries =
		sortedDb.length > sortedGit.length ? sortedDb.length : sortedGit.length;
	console.log("Highest ID", moreEntries);
	for (let i = 0; i < moreEntries; i++) {
		if (
			JSON.stringify(sortedDb[i]?.names) !==
				JSON.stringify(sortedGit[i]?.names) ||
			sortedDb[i]?.id !== sortedGit[i]?.id
		) {
			differences.push({
				index: i + 1,
				db: JSON.stringify(sortedDb[i]?.names),
				git: JSON.stringify(sortedGit[i]?.names),
			});
		}
	}

	return differences;
}

async function updatePokemonGithub(pb) {
	const [pokemonGithub, pokemonDb] = await Promise.all([
		getExistingFile(pokemonFileName),
		pokemonDbToJson(pb),
	]);

	const sortedDb = pokemonDb.sort((a, b) => {
		return a.id > b.id ? 1 : -1;
	});

	const sortedGit = pokemonGithub.sort((a, b) => {
		return a.id > b.id ? 1 : -1;
	});

	const differences = findDifferences(sortedDb, sortedGit);

	if (differences.length === 0) {
		return false;
	}

	// Convert the merged object to a string and encode it in base64
	const content = Buffer.from(JSON.stringify(sortedDb)).toString("base64");

	const sha = await getFileSha(
		"helblingjoel",
		"pokecompanion",
		"src/lib/data/pokemonNames.json"
	);

	// Commit the changes to the main branch of the GitHub repository
	await octokit.repos.createOrUpdateFileContents({
		owner: "helblingjoel",
		repo: "pokecompanion",
		path: "src/lib/data/pokemonNames.json",
		message: `Auto: ${differences.length} updates syncd\n${differences
			.map((diff) => {
				return `Pokemon ${diff.index}`;
			})
			.join("\n")}`,
		content: content,
		sha,
		branch: "main",
	});

	return differences;
}

async function updateMoveGithub(pb) {
	const [moveGithub, moveDb] = await Promise.all([
		getExistingFile(moveFileName),
		moveDbToJson(pb),
	]);

	const sortedDb = moveDb.sort((a, b) => {
		return a.id > b.id ? 1 : -1;
	});

	const sortedGit = moveGithub.sort((a, b) => {
		return a.id > b.id ? 1 : -1;
	});

	const differences = findDifferences(sortedDb, sortedGit);

	if (differences.length === 0) {
		return false;
	}

	const content = Buffer.from(JSON.stringify(sortedDb)).toString("base64");

	const sha = await getFileSha(
		"helblingjoel",
		"pokecompanion",
		"src/lib/data/moves.json"
	);

	// Commit the changes to the main branch of the GitHub repository
	await octokit.repos.createOrUpdateFileContents({
		owner: "helblingjoel",
		repo: "pokecompanion",
		path: "src/lib/data/moves.json",
		message: `Auto: ${differences.length} updates syncd\n${differences
			.map((diff) => {
				return `Move ${diff.index}`;
			})
			.join("\n")}`,
		content: content,
		sha,
		branch: "main",
	});

	return differences;
}

const moveDbToJson = async (pb) => {
	const moves = await pb.collection("moves").getFullList({
		sort: "move_id",
	});

	const normalisedDb = moves.map((entry) => {
		return {
			id: entry.move_id,
			names: [
				{
					en: entry.en,
				},
				{
					de: entry.de,
				},
				{
					es: entry.es,
				},
				{
					fr: entry.fr,
				},
				{
					it: entry.it,
				},
				{
					"ja-hrkt": entry.ja_hrkt,
				},
				{
					"zh-hans": entry.zh_hans,
				},
			],
		};
	});

	return normalisedDb;
};

async function getFileSha(owner, repo, path) {
	const { data } = await octokit.repos.getContent({
		owner: owner,
		repo: repo,
		path: path,
	});

	return data.sha;
}

// handler();
