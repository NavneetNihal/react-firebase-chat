import { useState } from "react";
import "./userInfo.css";
import useUserStore from "../../../lib/userStore"; 
import { databases, appwriteConfig } from "../../../lib/appwrite";
import { Permission, Role } from "appwrite";
import upload from "../../../lib/upload";
import { toast } from "react-toastify";
import { playSoundEffect } from "../../../lib/sound";

const Userinfo = () => {
  const { currentUser, fetchUserInfo, updateCurrentUser } = useUserStore();
  const [openEdit, setOpenEdit] = useState(false);
  const [loading, setLoading] = useState(false);
  const [newAvatar, setNewAvatar] = useState({ file: null, url: "" });
  const [showAvatarPreview, setShowAvatarPreview] = useState(false);
  const [soundOpen, setSoundOpen] = useState(false);
  const [soundSetting, setSoundSetting] = useState(
    () => (typeof window !== "undefined" && localStorage.getItem("notificationSoundSetting")) || "oof"
  );

  const handleAvatarChange = (e) => {
    if (e.target.files[0]) {
      setNewAvatar({
        file: e.target.files[0],
        url: URL.createObjectURL(e.target.files[0]),
      });
    }
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setLoading(true);

    const formData = new FormData(e.target);
    const username = (formData.get("username") || "").trim() || currentUser.username;
    const status   = (formData.get("status")   || "").trim();
    const currentUserId = currentUser?.$id || currentUser?.id;

    if (typeof window !== "undefined") {
      localStorage.setItem("notificationSoundSetting", soundSetting);
    }

    try {
      // ── Step 1: upload new avatar if user picked one ──────────────────
      let imgUrl = currentUser.avatar;
      if (newAvatar.file) {
        try {
          const permissions = [
            Permission.read(Role.any()),
            Permission.update(Role.user(currentUserId)),
            Permission.delete(Role.user(currentUserId)),
          ];
          imgUrl = await upload(newAvatar.file, permissions);
        } catch (uploadErr) {
          console.error("Avatar upload failed:", uploadErr);
          toast.error("Avatar upload failed: " + (uploadErr.message || "Unknown error"));
          setLoading(false);
          return; // stop here, don't touch the DB
        }
      }

      // ── Step 2: try update with status ────────────────────────────────
      let savedStatus = false;
      try {
        await databases.updateDocument(
          appwriteConfig.databaseId,
          appwriteConfig.usersCollectionId,
          currentUserId,
          { username, avatar: imgUrl, status }
        );
        savedStatus = true;
      } catch (dbErr) {
        // Appwrite rejects unknown attributes (status may not be in schema)
        // Error code 400 or message contains "Unknown attribute"
        const msg  = dbErr.message || "";
        const code = dbErr.code || 0;
        const isSchemaError =
          msg.toLowerCase().includes("unknown attribute") ||
          msg.toLowerCase().includes("invalid document") ||
          code === 400;

        if (isSchemaError) {
          // Fallback: save without status
          await databases.updateDocument(
            appwriteConfig.databaseId,
            appwriteConfig.usersCollectionId,
            currentUserId,
            { username, avatar: imgUrl }
          );
        } else {
          throw dbErr; // re-throw unrelated errors
        }
      }

      // ── Step 3: patch local state IMMEDIATELY ─────────────────────────
      // This makes the avatar and username update in the sidebar right away.
      updateCurrentUser({ username, avatar: imgUrl, ...(savedStatus ? { status } : {}) });

      // ── Step 4: background re-fetch to keep store in sync with DB ─────
      fetchUserInfo(currentUserId).catch(() => {/* non-critical, local state already patched */});

      if (savedStatus) {
        toast.success("Profile updated!");
      } else {
        toast.warning(
          "Saved! — To enable Status updates, add a 'status' String attribute in your Appwrite users collection."
        );
      }
      setOpenEdit(false);
    } catch (err) {
      console.error("Profile save error:", err);
      toast.error("Failed to save profile: " + (err.message || "Unknown error"));
    } finally {
      setLoading(false);
      setNewAvatar({ file: null, url: "" });
    }
  };

  return (
    <div className='userInfo'>
      <div className="user">
        <div className="avatarEditWrap" onClick={() => setOpenEdit(true)} title="Edit profile">
          <img src={currentUser.avatar || "./avatar.png"} alt="" />
          <div className="avatarEditOverlay">
            <span>✏️</span>
          </div>
        </div>
        <div className="userTexts">
          <h2>{currentUser.username}</h2>
          <p className="userStatus">{currentUser.status || "Set a status..."}</p>
        </div>
      </div>

      {openEdit && (
        <div className="profileModal" onClick={() => { setOpenEdit(false); setNewAvatar({ file: null, url: "" }); }}>
          <div className="modalContent" onClick={(e) => e.stopPropagation()}>
            <h2>Edit Profile</h2>
            <form onSubmit={handleSaveProfile}>
              {/* Avatar picker */}
            <label htmlFor="modalFile" className="avatarLabel">
                <div className="avatarLabelInner">
                  <img src={newAvatar.url || currentUser.avatar || "./avatar.png"} alt="" />
                  <button
                    type="button"
                    className="viewAvatarBtn"
                    title="View current profile picture"
                    onClick={(e) => { e.preventDefault(); setShowAvatarPreview(true); }}
                  >
                    👁
                  </button>
                </div>
                <span>Click to change avatar</span>
              </label>
              <input
                type="file"
                id="modalFile"
                accept="image/*"
                style={{ display: "none" }}
                onChange={handleAvatarChange}
              />

              <div className="inputGroup">
                <label>Username</label>
                <input
                  type="text"
                  name="username"
                  defaultValue={currentUser.username}
                  required
                />
              </div>

              <div className="inputGroup">
                <label>Status</label>
                <input
                  type="text"
                  name="status"
                  placeholder="e.g. Available, Busy, In a meeting"
                  defaultValue={currentUser.status || ""}
                />
              </div>

              <div className="inputGroup">
                <div
                  className="soundToggleRow"
                  onClick={() => setSoundOpen((p) => !p)}
                >
                  <label>Notification Sound</label>
                  <span className="soundCurrentLabel">
                    {[
                      { id: "chime", label: "Subtle Chime" },
                      { id: "trombone", label: "Sad Trombone" },
                      { id: "buzzer", label: "Wrong Buzzer" },
                      { id: "oof", label: "Gaming 'Oof'" },
                      { id: "laser", label: "Arcade Laser" }
                    ].find((o) => o.id === soundSetting)?.label || soundSetting}
                  </span>
                  <img
                    src={soundOpen ? "./arrowUp.png" : "./arrowDown.png"}
                    alt=""
                    className="soundArrow"
                  />
                </div>
                {soundOpen && (
                  <div className="soundOptions">
                    {[
                      { id: "chime", label: "Subtle Chime (Classic)" },
                      { id: "trombone", label: "Sad Trombone (Roast/Fail)" },
                      { id: "buzzer", label: "Wrong Buzzer (Roast/Error)" },
                      { id: "oof", label: "Gaming 'Oof' (Subtle/Funny)" },
                      { id: "laser", label: "Arcade Laser (Retro/Sarcastic)" }
                    ].map((opt) => (
                      <div key={opt.id} className="soundOptionRow">
                        <input
                          type="radio"
                          id={`sound-${opt.id}`}
                          name="soundSetting"
                          value={opt.id}
                          checked={soundSetting === opt.id}
                          onChange={(e) => setSoundSetting(e.target.value)}
                        />
                        <label htmlFor={`sound-${opt.id}`}>{opt.label}</label>
                        <button
                          type="button"
                          className="playPreviewBtn"
                          onClick={() => playSoundEffect(opt.id)}
                        >
                          🔊
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="modalActions">
                <button
                  type="button"
                  className="cancelBtn"
                  onClick={() => { setOpenEdit(false); setNewAvatar({ file: null, url: "" }); }}
                >
                  Cancel
                </button>
                <button type="submit" className="saveBtn" disabled={loading}>
                  {loading ? "Saving..." : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Full-size avatar preview overlay */}
      {showAvatarPreview && (
        <div
          className="avatarPreviewOverlay"
          onClick={() => setShowAvatarPreview(false)}
        >
          <img
            src={newAvatar.url || currentUser.avatar || "./avatar.png"}
            alt="Profile picture"
            className="avatarPreviewImg"
          />
          <span className="avatarPreviewClose">✕ Close</span>
        </div>
      )}
    </div>
  );
};

export default Userinfo;