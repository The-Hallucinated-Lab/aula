# Disaster recovery and rollback

## What can actually go wrong here

Most disaster-recovery planning is about a server: a region falls over, a
database is corrupted, a deploy takes production down. Aula has none of those,
and writing an RPO for a database that does not exist would be a document
nobody could act on.

What Aula has is different, and narrower:

- **A user's machine**, holding the only copy of their work.
- **A repository**, holding the only copy of the source and its history.
- **A release**, which can ship a defect to people who then install it.

Those are the three things that can be lost, and each has a different owner, a
different warning time and a different fix. This plan covers all three,
honestly, including the parts where the answer is "you cannot recover this, so
here is how not to lose it".

---

## 1. Where the user's data actually lives

There is no database and no server, so this is the whole inventory.

| What                               | Where                                   | Survives a crash? | Survives reinstall? | Recoverable if lost?           |
| ---------------------------------- | --------------------------------------- | ----------------- | ------------------- | ------------------------------ |
| Configuration and constraint state | `localStorage`, key `aula.project.v1`   | **Yes**           | No                  | Only from a saved project file |
| Saved project                      | wherever the user chose, `*.aula.json`  | Yes               | Yes                 | No — this is the master copy   |
| The solved timetable               | memory only                             | **No**            | No                  | Yes — re-solve, ~2 s           |
| Window geometry                    | `%APPDATA%/Aula/window-state.json`      | Yes               | No                  | Irrelevant                     |
| Telemetry consent                  | `%APPDATA%/Aula/telemetry-consent.json` | Yes               | No                  | Irrelevant                     |
| Theme                              | `localStorage`, key `aula.theme`        | Yes               | No                  | Irrelevant                     |
| Exports (CSV)                      | wherever the user chose                 | Yes               | Yes                 | Yes — re-export                |

Two things follow from this table, and they are the two most important
sentences in this document.

**The solved timetable is deliberately not persisted.** It is re-derived. That
is a design decision, not a gap: restoring a stored schedule after an engine or
catalogue change would show a timetable the current rules would refuse to
produce, which is precisely the lie this application exists not to tell. Losing
it costs about two seconds.

**`localStorage` is not a backup.** It survives a crash, a reload and a
restart. It does not survive a reinstall, a Windows profile reset, a
`--user-data-dir` change, or clearing site data. The saved `.aula.json` file is
the only durable copy of a user's work.

### RPO and RTO, for the only thing that has them

|         |                                                                   |
| ------- | ----------------------------------------------------------------- |
| **RPO** | The user's last explicit save. Aula does not auto-save to a file. |
| **RTO** | Under a minute: open Aula, File ▸ Open project, generate.         |

The RPO is the honest weak point, and §5 says what to do about it.

---

## 2. Backing up a user's work

Aula has no backup feature. It does not need one — a project is a single JSON
file — but the guidance has to be explicit or nobody follows it.

### For one person

Save the project to a folder that is already backed up. On a university
machine that usually means OneDrive, a mapped network drive, or the user's
roaming profile.

```
Documents\Aula\      ← OneDrive-synced
  muj-2026-odd.aula.json
```

Save after each significant change: after setup, after a roster import, after
constraint changes. The file is small — a few hundred kilobytes.

### For a timetable office

Put projects on a network share and let the existing file-server backup cover
them. This is the recommended arrangement, because it makes Aula's data
somebody's job by default rather than one person's habit.

```powershell
# Nightly copy of every Aula project to a dated folder.
# Register with: schtasks /create /tn "Aula projects backup" /tr "powershell -File C:\ops\backup-aula.ps1" /sc daily /st 19:00

$Source  = "\\files\timetabling\aula"
$Archive = "\\backup\timetabling\aula"
$Stamp   = Get-Date -Format 'yyyy-MM-dd'
$Target  = Join-Path $Archive $Stamp

New-Item -ItemType Directory -Force -Path $Target | Out-Null
Copy-Item -Path (Join-Path $Source '*.aula.json') -Destination $Target -Force

# Keep 90 days. A timetable is revised over a term, and being able to go back
# to "before the elective changes" is the whole point of keeping any of them.
Get-ChildItem $Archive -Directory |
  Where-Object { $_.CreationTime -lt (Get-Date).AddDays(-90) } |
  Remove-Item -Recurse -Force

# A backup nobody has restored is a hypothesis. Prove the newest file parses.
$Newest = Get-ChildItem $Target -Filter *.aula.json | Select-Object -First 1
if ($Newest) {
  try {
    $null = Get-Content $Newest.FullName -Raw | ConvertFrom-Json
    Write-Output "OK: $($Newest.Name) parses"
  } catch {
    Write-Error "CORRUPT: $($Newest.Name) — $_"
    exit 1
  }
}
```

### Recovering the in-progress project when there is no file

If a user never saved and their machine is still working, the configuration is
in `localStorage` and can be exported before anything else is done:

1. Open Aula.
2. **File ▸ Save project…** — this writes what is in `localStorage` to a file.

If Aula will not start, the value can be read out of the Electron profile:

```
%APPDATA%\Aula\Local Storage\leveldb\
```

That is a LevelDB store, not a text file. It is a last resort and it is not a
supported path — treat recovering from it as forensics, not procedure.

---

## 3. Rolling back a release

### The application

Aula is a versioned NSIS installer plus a portable build. Rollback is
installing the previous version.

1. Get the previous installer from the GitHub release, or from the CI artifact
   on the commit before the bad one.
2. Uninstall the current version — or do not; the installer replaces in place.
3. Install the previous version.
4. **Projects are unaffected.** `localStorage` and saved files are not touched
   by an install.

**The one thing to check** is whether the bad release changed the saved-project
shape. `normaliseConfig` migrates _forward_ — an older file opened by a newer
Aula is upgraded — but there is no downgrade path. A project saved by 1.4 and
opened by 1.3 will have unrecognised fields dropped by normalisation, silently.

If a release changed the schema, roll the _file_ back too: use the previous
day's copy from the backup above. This is the single strongest argument for the
dated-folder retention in §2.

### The source

```bash
# What shipped in each release
git tag --list 'v*' --sort=-version:refname | head

# Undo a released commit without rewriting history.
# `revert`, not `reset` — the tag and the release notes both point at history
# that other clones already have.
git revert <sha>
git push
```

`semantic-release` will publish the revert as a new patch version. That is the
correct outcome: rolling forward to a version that does not contain the defect
is easier to reason about than pretending the bad one never existed.

**Never force-push `main`.** The changelog, the tags and the GitHub releases
all reference it.

### The container image

```bash
docker pull ghcr.io/the-hallucinated-lab/aula:v1.3.0
docker compose up -d
# or
kubectl -n aula set image deployment/aula-web web=ghcr.io/the-hallucinated-lab/aula:v1.3.0
kubectl -n aula rollout status deployment/aula-web
kubectl -n aula rollout undo deployment/aula-web    # to the previous revision
```

The image serves static files and holds no state, so a rollback is complete the
moment the pods are replaced. `revisionHistoryLimit: 3` keeps three to go back
to.

---

## 4. Recovering the repository

### If GitHub is unavailable

Every clone is a complete backup, including all history and tags.

```bash
git remote add mirror <new-remote>
git push mirror --all
git push mirror --tags
```

What does **not** live in a clone, and would have to be recreated:

- Repository secrets (`ANTHROPIC_API_KEY`).
- Branch protection and required-check settings.
- Issues, pull request discussions and releases as GitHub objects. The release
  _content_ is reconstructible from tags and `CHANGELOG.md`; the discussion is
  not.

### A periodic off-platform mirror

```bash
# A bare mirror is a complete, restorable copy of everything git knows.
git clone --mirror https://github.com/The-Hallucinated-Lab/aula.git aula.git
cd aula.git && git remote update --prune
```

Run it monthly and keep the result somewhere that is not GitHub.

### If a dependency disappears from npm

`package-lock.json` pins every version and integrity hash, but it does not
contain the code. If a package is unpublished:

```bash
# Vendor the current, resolved tree while it is still resolvable.
npm ci
tar -czf aula-node_modules-$(date +%F).tar.gz node_modules
```

Fifteen runtime packages, `reports/licenses.json` lists them. That is a small
enough surface to vendor if it ever matters.

---

## 5. Known gaps

Stated rather than omitted, because a recovery plan that only lists what works
is not a plan.

| Gap                                                                                                             | Impact                                                                                                                                          | Mitigation today                                                                                                              |
| --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| **No auto-save.** RPO is the user's last manual save.                                                           | A crash between saves loses the edits since, though not the configuration — that is in `localStorage`.                                          | Save often; put projects on a synced folder. A periodic auto-save to a sidecar file is the obvious fix and is on the roadmap. |
| **No downgrade migration.** A newer file opened by an older Aula silently loses unrecognised fields.            | A rollback across a schema change can cost data.                                                                                                | Roll the project file back alongside the application. Keep the dated backups.                                                 |
| **`localStorage` is not durable.**                                                                              | A profile reset loses an unsaved project entirely.                                                                                              | The saved file is the master copy. Say so to users.                                                                           |
| **No integrity check on a project file.**                                                                       | A truncated or corrupted file is refused by `normaliseConfig`, which is safe, but there is no checksum to detect silent corruption in a backup. | The verification step in the backup script above parses each file, which catches truncation.                                  |
| **The container image has not been built.** Docker Desktop would not start on the machine this was authored on. | The Dockerfile is reviewed, not run. One bug was already found in it by inspection.                                                             | Build it in CI before relying on the container path.                                                                          |
| **No restore drill has been performed.**                                                                        | The procedures above are written, not exercised.                                                                                                | Run §6 once, and again whenever the schema changes.                                                                           |

---

## 6. The drill

A recovery procedure nobody has run is a guess. This takes ten minutes and
should be done once per term, and after any change to the saved-project shape.

1. **Save a project.** Set up an institution, generate, `File ▸ Save project…`.
2. **Destroy the local state.** Close Aula. Clear the Electron profile:
   `%APPDATA%\Aula\Local Storage`.
3. **Reopen.** Aula should start on the default institution — an empty state,
   not an error.
4. **Restore.** `File ▸ Open project…`, pick the saved file.
5. **Verify.** The figures on the Overview should match what was saved. Press
   Generate; the session count should match.
6. **Roll back.** Install the previous version. Open the same file. Confirm it
   still loads, and note anything the older version drops.

Record the result — including the date and the version pair — in
`docs/CONTEXT.md`, which is the append-only log this repository uses for
exactly this kind of fact.

---

## 7. Contacts and escalation

| Situation                             | Action                                                                                                                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A user has lost work                  | §2, "Recovering the in-progress project". Do not reinstall first — a reinstall does not clear `localStorage`, but a profile reset does, and people reach for both. |
| A release is broken                   | Roll back per §3, then `git revert` and let semantic-release publish the fix forward.                                                                              |
| A security issue                      | Report privately via the repository's security advisory, not an issue. See `CONTRIBUTING.md`.                                                                      |
| The build cannot resolve dependencies | §4, "If a dependency disappears from npm".                                                                                                                         |
