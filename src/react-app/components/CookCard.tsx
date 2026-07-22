import type { Pack, Project } from "../../shared/types";
import { missingMustUse, normalizeProject, stepOn } from "../../shared/types";

type Props = {
	pack: Pack;
	project: Project;
};

export function CookCard({ pack, project }: Props) {
	const p = normalizeProject(project);
	const missing = missingMustUse(pack, p);
	const mustSamples = pack.brief.mustUseIds
		.map((id) => pack.samples.find((s) => s.id === id))
		.filter(Boolean);

	return (
		<section className="cook-card">
			<header>
				<p className="eyebrow">cook card · {pack.genre}</p>
				<h3>{pack.brief.title}</h3>
				<p className="vibe">{pack.brief.vibe}</p>
			</header>
			<div className="must-grid">
				{mustSamples.map((s) => {
					if (!s) return null;
					const track = p.tracks.find((t) => t.sampleId === s.id);
					const hits = track?.steps.filter((c) => stepOn(c)).length ?? 0;
					return (
						<div
							key={s.id}
							className={`must-chip ${hits > 0 ? "ok" : "need"}`}
						>
							<span className="must-role">{s.role}</span>
							<span className="must-name">{s.name}</span>
							<span className="must-state">
								{hits > 0 ? `${hits} hits` : "USE ME"}
							</span>
						</div>
					);
				})}
			</div>
			<p className="cook-tip">
				<strong>Tip:</strong> {pack.brief.tip}
			</p>
			{missing.length > 0 ? (
				<p className="cook-warn">Still need: {missing.join(", ")}</p>
			) : (
				<p className="cook-ready">Required sounds are in — nice.</p>
			)}
		</section>
	);
}
